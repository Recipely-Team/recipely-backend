import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';

export interface DeleteAccountInput {
  readonly userId: string;
}

/**
 * Deletes the authenticated user's account.
 *
 * The account is tombstoned, not dropped: its PII is scrubbed, its content is
 * soft-deleted, its sessions and relationships are purged, and the deletion is
 * written to the account event log — all in one transaction (see
 * `AuthRepositoryInterface.deleteAccount`). The account becomes unusable and
 * unrecoverable by its owner, which is what Apple App Store Guideline 5.1.1(v)
 * requires; keeping the scrubbed row is what makes the deletion auditable and
 * lets the user's recipes/comments be restored if a deletion is ever disputed.
 *
 * Signing up again with the same address yields a NEW account with a NEW id — the
 * tombstone is never revived, and the event log records the link between the two.
 *
 * The food diary is the exception to "tombstoned, not dropped": it is personal,
 * health-like data with no audit value, so it is hard-deleted — FIRST, so a
 * purge that fails leaves the account intact for the user to retry, rather than
 * a deleted account whose diary nobody can reach any more. The Instagram link
 * (its token), comment-to-DM rules and send history go the same way, for the
 * same reasons — and a stored token must not outlive its owner's account.
 */
export class DeleteAccountUseCase {
  constructor(
    private readonly authRepo: AuthRepositoryInterface,
    private readonly diaryRepo: FoodDiaryRepositoryInterface,
    private readonly instagram: Pick<InstagramConnectionRepositoryInterface, 'purgeUser'>,
  ) {}

  async execute(input: DeleteAccountInput): Promise<Result<void, Failure>> {
    const purged = await this.diaryRepo.purgeUser(input.userId);
    if (!purged.ok) return purged;
    const unlinked = await this.instagram.purgeUser(input.userId);
    if (!unlinked.ok) return unlinked;
    return this.authRepo.deleteAccount(input.userId);
  }
}
