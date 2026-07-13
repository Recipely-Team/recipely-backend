import type { PrismaClient, Prisma as PrismaTypes } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import type { User } from '@domain/auth/user';
import { DeletedAccount } from '@domain/auth/deleted-account';
import type {
  CreateUserInput,
  FindOrCreateSocialUserInput,
  IAuthRepository,
  SocialUserResult,
  UserCredentials,
} from '@domain/auth/i-auth-repository';
import { UserRowMapper } from '@infrastructure/prisma/mappers/user.row-mapper';
import { emailFingerprint } from '@infrastructure/security/email-fingerprint';

/** Tombstoned accounts are invisible to every read path. */
const ACTIVE = { deletedAt: null } as const;

export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredentialsByEmail(email: Email): Promise<Result<UserCredentials | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({ where: { email: email.value, ...ACTIVE } });
      if (!row) return ok(null);
      // Social-only users have no password — treat as "not found" for password login.
      if (!row.passwordHash) return ok(null);

      const userResult = UserRowMapper.toDomain(row);
      if (!userResult.ok) return userResult;

      return ok({ user: userResult.value, passwordHash: row.passwordHash, role: row.role });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async existsByEmail(email: Email): Promise<Result<boolean, Failure>> {
    try {
      const count = await this.prisma.user.count({ where: { email: email.value, ...ACTIVE } });
      return ok(count > 0);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async createUser(input: CreateUserInput): Promise<Result<User, Failure>> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email.value,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
          },
        });
        await recordRecreationIfReturning(tx, created.id, input.email.value);
        return created;
      });
      return UserRowMapper.toDomain(row);
    } catch (err) {
      // WHY: race against existsByEmail — unique constraint violation is the canonical check.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return fail(new ConflictFailure('Email is already registered'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findById(id: string): Promise<Result<User | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({ where: { id, ...ACTIVE } });
      if (!row) return ok(null);
      const userResult = UserRowMapper.toDomain(row);
      if (!userResult.ok) return userResult;
      return ok(userResult.value);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async isActive(userId: string): Promise<Result<boolean, Failure>> {
    try {
      const count = await this.prisma.user.count({ where: { id: userId, ...ACTIVE } });
      return ok(count > 0);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findRoleById(id: string): Promise<Result<string | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({ where: { id, ...ACTIVE }, select: { role: true } });
      return ok(row?.role ?? null);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findByEmail(email: string): Promise<Result<User | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({ where: { email, ...ACTIVE } });
      if (!row) return ok(null);
      const userResult = UserRowMapper.toDomain(row);
      if (!userResult.ok) return userResult;
      return ok(userResult.value);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async updateAvatar(userId: string, photoUrl: string): Promise<Result<User, Failure>> {
    return this.updateActiveUser(userId, { photoUrl });
  }

  async updateProfile(userId: string, data: { displayName?: string; bio?: string }): Promise<Result<User, Failure>> {
    return this.updateActiveUser(userId, {
      ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<Result<void, Failure>> {
    const result = await this.updateActiveUser(userId, { passwordHash });
    if (!result.ok) return result;
    return ok(undefined);
  }

  /**
   * Applies a patch to a live account. Goes through `updateMany` rather than
   * `update` because only the latter's `where` is restricted to unique fields —
   * `updateMany` can carry the `deletedAt: null` guard, so a tombstoned account
   * can never be written back to life through a profile / password path.
   */
  private async updateActiveUser(userId: string, data: PrismaTypes.UserUpdateManyMutationInput): Promise<Result<User, Failure>> {
    try {
      const { count } = await this.prisma.user.updateMany({ where: { id: userId, ...ACTIVE }, data });
      if (count === 0) return fail(new NotFoundFailure('errors.not_found.user'));

      const row = await this.prisma.user.findFirst({ where: { id: userId, ...ACTIVE } });
      if (!row) return fail(new NotFoundFailure('errors.not_found.user'));
      return UserRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteAccount(userId: string): Promise<Result<void, Failure>> {
    try {
      const notFound = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({ where: { id: userId, ...ACTIVE } });
        if (!user) return true;

        const now = new Date();

        // 1. Tombstone the account and scrub its PII. Rewriting the email is what
        //    releases the real address: a later signup with it lands on a fresh row.
        await tx.user.update({
          where: { id: userId },
          data: {
            deletedAt: now,
            email: DeletedAccount.tombstoneEmail(userId),
            displayName: DeletedAccount.DISPLAY_NAME,
            passwordHash: null,
            bio: null,
            photoUrl: null,
          },
        });

        // 2. Hide the account's content. Recipes and comments carry their own
        //    `deletedAt`, so every read path already filters them out.
        await tx.recipe.updateMany({
          where: { ownerId: userId, ...ACTIVE },
          data: { deletedAt: now },
        });
        await this.softDeleteComments(tx, userId, now);

        // 3. Purge credentials and relationship rows. These are not the user's
        //    content: leaving them behind would keep a live session alive and keep
        //    counting a deleted account in other users' follower / like / favorite
        //    totals. (Drafts, feedback and AI logs stay attached to the tombstone —
        //    unreachable, since the account can no longer authenticate.)
        await tx.fcmToken.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });
        await tx.favorite.deleteMany({ where: { userId } });
        await tx.recipeLike.deleteMany({ where: { userId } });
        await tx.commentLike.deleteMany({ where: { userId } });
        await tx.userFollow.deleteMany({
          where: { OR: [{ followerId: userId }, { followingId: userId }] },
        });
        await tx.notification.deleteMany({ where: { recipientId: userId } });
        await tx.notification.updateMany({ where: { senderId: userId }, data: { senderId: null } });

        // 4. Audit. Same transaction as the deletion — a deletion that could not be
        //    logged must not commit.
        await tx.accountEventLog.create({
          data: { event: 'DELETED', userId, emailHash: emailFingerprint(user.email) },
        });

        return false;
      });

      if (notFound) return fail(new NotFoundFailure('errors.not_found.user'));
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  /**
   * Soft-deletes the user's comments and rebalances the denormalised
   * `Recipe.commentCount` — the counter is maintained by the application layer, so
   * hiding comments without decrementing it would leave every affected recipe
   * advertising comments nobody can see.
   */
  private async softDeleteComments(tx: PrismaTransaction, userId: string, now: Date): Promise<void> {
    const grouped = await tx.comment.groupBy({
      by: ['recipeId'],
      where: { authorId: userId, ...ACTIVE },
      _count: { _all: true },
    });
    if (grouped.length === 0) return;

    await tx.comment.updateMany({ where: { authorId: userId, ...ACTIVE }, data: { deletedAt: now } });

    for (const group of grouped) {
      await tx.recipe.update({
        where: { id: group.recipeId },
        data: { commentCount: { decrement: group._count._all } },
      });
    }
  }

  async findOrCreateSocialUser(
    input: FindOrCreateSocialUserInput,
  ): Promise<Result<SocialUserResult, Failure>> {
    try {
      const existing = await this.prisma.user.findFirst({
        where: { email: input.email.value, ...ACTIVE },
      });

      if (existing) {
        const userResult = UserRowMapper.toDomain(existing);
        if (!userResult.ok) return userResult;
        return ok({ user: userResult.value, role: existing.role });
      }

      // No live account owns this address — including the case where a previous
      // one was deleted. Social sign-in therefore mints a NEW account (new id),
      // it does not adopt the tombstone.
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.user.create({
          data: {
            email: input.email.value,
            passwordHash: null,
            displayName: input.displayName,
            photoUrl: input.photoUrl,
          },
        });
        await recordRecreationIfReturning(tx, row.id, input.email.value);
        return row;
      });
      const userResult = UserRowMapper.toDomain(created);
      if (!userResult.ok) return userResult;
      return ok({ user: userResult.value, role: created.role });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Race condition: email was inserted between findFirst and create — retry once.
        try {
          const row = await this.prisma.user.findFirst({ where: { email: input.email.value, ...ACTIVE } });
          if (row) {
            const userResult = UserRowMapper.toDomain(row);
            if (!userResult.ok) return userResult;
            return ok({ user: userResult.value, role: row.role });
          }
        } catch (retryErr) {
          return fail(new UnknownFailure(errorMessage(retryErr)));
        }
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

/** The subset of the client available inside `prisma.$transaction(async (tx) => …)`. */
type PrismaTransaction = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Records a RECREATED event when the address of a just-created account has been
 * through deletion before, linking the new id to the tombstone it replaces. Silent
 * no-op for a first-time signup. Runs inside the caller's transaction so the log
 * and the account it describes commit together.
 */
async function recordRecreationIfReturning(tx: PrismaTransaction, userId: string, email: string): Promise<void> {
  const emailHash = emailFingerprint(email);
  const previous = await tx.accountEventLog.findFirst({
    where: { event: 'DELETED', emailHash },
    orderBy: { createdAt: 'desc' },
    select: { userId: true },
  });
  if (!previous) return;

  await tx.accountEventLog.create({
    data: { event: 'RECREATED', userId, emailHash, previousUserId: previous.userId },
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
