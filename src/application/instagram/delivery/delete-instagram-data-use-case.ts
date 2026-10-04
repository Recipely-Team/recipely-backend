import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';

export interface DeleteInstagramDataInput {
  /** The Instagram account Meta named in the signed request. */
  readonly igUserId: string;
  /** `true` for the data-deletion callback (everything); `false` for deauthorize (the link only). */
  readonly everything: boolean;
}

/**
 * **Meta's deauthorize and data-deletion callbacks** (signature already
 * verified). Deauthorize — the user removed the app in Instagram — forgets the
 * link and its token; data deletion also erases the user's rules and send
 * history. An account we never linked is a no-op: Meta expects success.
 */
export class DeleteInstagramDataUseCase {
  constructor(private readonly connections: InstagramConnectionRepositoryInterface) {}

  async execute(input: DeleteInstagramDataInput): Promise<Result<void, Failure>> {
    const found = await this.connections.findByIgUserId(input.igUserId);
    if (!found.ok) return found;
    if (found.value === null) return ok(undefined);
    return input.everything ? this.connections.purgeUser(found.value.userId) : this.connections.delete(found.value.userId);
  }
}
