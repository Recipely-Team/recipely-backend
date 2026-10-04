import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  InstagramPendingLinkRepositoryInterface,
  PendingInstagramLink,
} from '@domain/instagram/instagram-pending-link-repository-interface';
import type { InstagramTokenCipher } from '@infrastructure/instagram/instagram-token-cipher';

/**
 * **`instagram_pending_links`** — found only by the hash of the one-time code,
 * token encrypted. `take` is a delete that returns the row, so two finalise
 * calls with the same code cannot both succeed. Expired links are swept
 * whenever a new one is parked.
 */
export class PrismaInstagramPendingLinkRepository implements InstagramPendingLinkRepositoryInterface {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: InstagramTokenCipher,
  ) {}

  async create(codeHash: string, link: PendingInstagramLink): Promise<Result<void, Failure>> {
    try {
      await this.prisma.$transaction([
        this.prisma.instagramPendingLink.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        this.prisma.instagramPendingLink.create({
          data: {
            userId: link.userId,
            codeHash,
            igUserId: link.igUserId,
            appScopedId: link.appScopedId,
            username: link.username,
            accessTokenEnc: this.cipher.encrypt(link.accessToken),
            tokenExpiresAt: link.tokenExpiresAt,
            expiresAt: link.expiresAt,
          },
        }),
      ]);
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async take(codeHash: string): Promise<Result<PendingInstagramLink | null, Failure>> {
    try {
      const rows = await this.prisma.instagramPendingLink.findMany({ where: { codeHash }, take: 1 });
      const row = rows[0];
      if (row === undefined) return ok(null);
      const { count } = await this.prisma.instagramPendingLink.deleteMany({ where: { id: row.id } });
      // Lost the race to a concurrent take of the same code.
      if (count === 0) return ok(null);
      const token = this.cipher.decrypt(row.accessTokenEnc);
      if (token === null) return ok(null);
      return ok({
        userId: row.userId,
        igUserId: row.igUserId,
        appScopedId: row.appScopedId,
        username: row.username,
        accessToken: token,
        tokenExpiresAt: row.tokenExpiresAt,
        expiresAt: row.expiresAt,
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
