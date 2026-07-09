import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';

export interface DeleteAccountInput {
  readonly userId: string;
}

/**
 * Permanently deletes the authenticated user's account and all associated data.
 * Required by Apple App Store Guideline 5.1.1(v): in-app account deletion must
 * remove the account, not merely deactivate it. The cascade is enforced at the
 * database level (see IAuthRepository.deleteAccount).
 */
export class DeleteAccountUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute(input: DeleteAccountInput): Promise<Result<void, Failure>> {
    return this.authRepo.deleteAccount(input.userId);
  }
}
