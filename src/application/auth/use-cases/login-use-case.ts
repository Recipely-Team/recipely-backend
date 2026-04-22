import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { AuthSessionDto } from '@application/auth/dtos/auth.dto';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export class LoginUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenSigner,
  ) {}

  async execute(input: LoginInput): Promise<Result<AuthSessionDto, Failure>> {
    const emailResult = Email.create(input.email);
    // WHY: return the same UnauthorizedFailure for both "bad email format" and
    // "wrong credentials" — never leak which half of the pair is wrong.
    if (!emailResult.ok) return fail(new UnauthorizedFailure('Invalid credentials'));
    const email = emailResult.value;

    const credsResult = await this.authRepo.findCredentialsByEmail(email);
    if (!credsResult.ok) return credsResult;

    const creds = credsResult.value;
    if (!creds) {
      return fail(new UnauthorizedFailure('Invalid credentials'));
    }

    const passwordOk = await this.hasher.verify(input.password, creds.passwordHash);
    if (!passwordOk) {
      return fail(new UnauthorizedFailure('Invalid credentials'));
    }

    const { user } = creds;
    const token = await this.tokens.sign({ sub: user.id, email: user.email.value });
    return ok({ token, user: UserMapper.toDto(user, creds.role) });
  }
}
