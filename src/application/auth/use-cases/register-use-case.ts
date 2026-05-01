import { fail, ok, type Result } from '@core/result/result';
import {
  ConflictFailure,
  ValidationFailure,
  type Failure,
} from '@core/failure';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { AuthSessionDto } from '@application/auth/dtos/auth.dto';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

const MIN_PASSWORD_LENGTH = 8;

export class RegisterUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenSigner,
  ) {}

  async execute(input: RegisterInput): Promise<Result<AuthSessionDto, Failure>> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return fail(
        new ValidationFailure(
          'errors.validation.password_too_short',
          'password',
        ),
      );
    }
    if (input.displayName.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.display_name_required', 'displayName'));
    }

    const emailResult = Email.create(input.email);
    if (!emailResult.ok) return emailResult;
    const email = emailResult.value;

    const existsResult = await this.authRepo.existsByEmail(email);
    if (!existsResult.ok) return existsResult;
    if (existsResult.value) {
      return fail(new ConflictFailure('errors.conflict.email_exists'));
    }

    const passwordHash = await this.hasher.hash(input.password);
    const created = await this.authRepo.createUser({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
    });
    if (!created.ok) return created;

    const user = created.value;
    const token = await this.tokens.sign({ sub: user.id, email: user.email.value });

    return ok({ token, user: UserMapper.toDto(user) });
  }
}