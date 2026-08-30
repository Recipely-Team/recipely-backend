import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';

export interface UnsuspendUserInput {
  readonly userId: string;
  /** The admin performing it, for the account event log. */
  readonly actorId?: string;
}

/** Backs the admin panel's unsuspend action on User — lifts a suspension. */
export class UnsuspendUserUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute(input: UnsuspendUserInput): Promise<Result<void, Failure>> {
    return this.authRepo.unsuspendUser(input.userId, input.actorId);
  }
}
