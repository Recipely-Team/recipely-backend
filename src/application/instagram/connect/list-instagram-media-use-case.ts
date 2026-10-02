import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { InstagramMediaDto } from '@application/instagram/dtos/instagram-media.dto';
import { InstagramMapper } from '@application/instagram/mappers/instagram.mapper';
import { instagramNotConfigured } from '@application/instagram/instagram-not-configured';
import type { MediaCursorCacheInterface } from '@application/instagram/ports/media-cursor-cache-interface';

export interface ListInstagramMediaInput {
  readonly userId: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * **`GET /me/instagram/media`** — the connected account's posts and Reels,
 * newest first, as a standard page.
 *
 * @remarks
 * - Instagram pages by cursor, not by number, so the cursor at which each
 *   page starts is remembered (per connection and page size); a page whose
 *   start is unknown is reached by walking from the nearest known one.
 * - `total` is the account's media count.
 * - `errors.instagram.not_connected` (409) without a usable connection.
 */
export class ListInstagramMediaUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly cursors: MediaCursorCacheInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ListInstagramMediaInput): Promise<Result<PageResult<InstagramMediaDto>, Failure>> {
    if (this.graph === null) return fail(instagramNotConfigured());
    const connection = await this.connections.findByUserId(input.userId);
    if (!connection.ok) return connection;
    if (connection.value === null || !connection.value.isUsable(this.now())) {
      return fail(new ConflictFailure('errors.instagram.not_connected'));
    }
    const token = connection.value.accessToken;
    const key = (page: number) => `${connection.value?.id ?? ''}|${input.pageSize}|${page}`;
    const { page, pageSize } = input;

    const profile = await this.graph.profile(token);
    if (!profile.ok) return profile;

    let known = page;
    while (known > 1 && this.cursors.get(key(known)) === undefined) known -= 1;
    let after = known === 1 ? null : (this.cursors.get(key(known)) ?? null);
    for (let at = known; ; at += 1) {
      if (at > 1 && after === null) return ok({ items: [], total: profile.value.mediaCount, page, pageSize });
      const found = await this.graph.listMedia(token, pageSize, after);
      if (!found.ok) return found;
      this.cursors.set(key(at + 1), found.value.after);
      if (at === page) {
        return ok({ items: found.value.items.map(InstagramMapper.media), total: profile.value.mediaCount, page, pageSize });
      }
      after = found.value.after;
    }
  }
}
