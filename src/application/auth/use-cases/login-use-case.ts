import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { PasswordHasherInterface } from '@application/auth/ports/password-hasher-interface';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { AuthSessionDto } from '@application/auth/dtos/auth-session.dto';
import type { DeviceRepositoryInterface, DeviceContext } from '@application/devices/ports/device-repository-interface';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly device?: DeviceContext;
}

export class LoginUseCase {
  constructor(
    private readonly authRepo: AuthRepositoryInterface,
    private readonly hasher: PasswordHasherInterface,
    private readonly tokens: TokenSignerInterface,
    private readonly devices: DeviceRepositoryInterface | null = null,
  ) {}

  async execute(input: LoginInput): Promise<Result<AuthSessionDto, Failure>> {
    const emailResult = Email.create(input.email);
    if (!emailResult.ok) return fail(new UnauthorizedFailure('errors.unauthorized.invalid_credentials'));
    const email = emailResult.value;

    const credsResult = await this.authRepo.findCredentialsByEmail(email);
    if (!credsResult.ok) return credsResult;

    const creds = credsResult.value;
    if (!creds) {
      return fail(new UnauthorizedFailure('errors.unauthorized.invalid_credentials'));
    }

    const passwordOk = await this.hasher.verify(input.password, creds.passwordHash);
    if (!passwordOk) {
      return fail(new UnauthorizedFailure('errors.unauthorized.invalid_credentials'));
    }

    const { user } = creds;

    // Before the token, not after: a suspended account signing in would
    // otherwise get a real session, look fully signed in to the client, and
    // leave a device-login row, only to 401 on its first real call. Deletion
    // is already rejected upstream, at the credentials lookup.
    const statusResult = await this.authRepo.getAccountStatus(user.id);
    if (!statusResult.ok) return statusResult;
    if (statusResult.value?.suspendedAt) {
      return fail(new UnauthorizedFailure('errors.unauthorized.account_suspended'));
    }

    const token = await this.tokens.sign({ sub: user.id, email: user.email.value });

    // Passive tracking, never on the critical path. The `.catch` is the
    // guarantee, not the repository's own try/catch: `DeviceRepositoryInterface` does
    // not promise "never rejects", so swallowing here is what keeps a broken
    // device repo from turning valid credentials into a 500.
    if (this.devices !== null && input.device !== undefined) {
      await this.devices.recordLogin({ userId: user.id, ...input.device }).catch(() => {});
    }

    return ok({ token, user: UserMapper.toDto(user, creds.role) });
  }
}