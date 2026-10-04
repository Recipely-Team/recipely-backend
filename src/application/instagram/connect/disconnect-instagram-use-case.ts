import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';

/**
 * **`DELETE /me/instagram`** — forgets the linked account and its token here.
 *
 * @remarks
 * - Local only: Instagram has no endpoint to revoke a Business Login token;
 *   the user removes the app in Instagram's settings, which reaches us as the
 *   deauthorize callback.
 * - The rules and their history stay (they simply stop sending), so
 *   reconnecting brings them back.
 * - The Instagram creator tag stays approved: it records that the user proved
 *   the account was theirs. They can withdraw it like any tag.
 */
export class DisconnectInstagramUseCase {
  constructor(private readonly connections: InstagramConnectionRepositoryInterface) {}

  execute(userId: string): Promise<Result<void, Failure>> {
    return this.connections.delete(userId);
  }
}
