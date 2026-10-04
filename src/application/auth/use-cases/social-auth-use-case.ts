import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import { accountAccessRefusal } from '@domain/auth/account-access';
import { Email } from '@domain/common/email';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { FirebaseTokenVerifierInterface } from '@application/auth/ports/firebase-token-verifier-interface';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { AuthSessionDto } from '@application/auth/dtos/auth-session.dto';
import type { DeviceRepositoryInterface, DeviceContext } from '@application/devices/ports/device-repository-interface';

export interface SocialAuthInput {
  readonly idToken: string;
  readonly device?: DeviceContext;
}

export class SocialAuthUseCase {
  constructor(
    private readonly authRepo: AuthRepositoryInterface,
    private readonly tokens: TokenSignerInterface,
    private readonly firebaseVerifier: FirebaseTokenVerifierInterface,
    private readonly devices: DeviceRepositoryInterface | null = null,
  ) {}

  async execute(input: SocialAuthInput): Promise<Result<AuthSessionDto, Failure>> {
    let firebaseUser;
    try {
      firebaseUser = await this.firebaseVerifier.verify(input.idToken);
    } catch {
      return fail(new UnauthorizedFailure('errors.unauthorized.invalid_firebase_token'));
    }

    if (!firebaseUser.email) {
      return fail(new UnauthorizedFailure('errors.unauthorized.no_email_in_token'));
    }

    const emailResult = Email.create(firebaseUser.email);
    if (!emailResult.ok) {
      return fail(new UnauthorizedFailure('errors.unauthorized.invalid_email_in_token'));
    }

    const namePart = (firebaseUser.name ?? '').trim();
    const displayName = namePart || (firebaseUser.email.split('@')[0] ?? 'User');

    const socialResult = await this.authRepo.findOrCreateSocialUser({
      email: emailResult.value,
      displayName,
      photoUrl: firebaseUser.picture ?? null,
    });
    if (!socialResult.ok) return socialResult;

    const { user, role } = socialResult.value;

    // Same reason as LoginUseCase: a suspended account must not get a session,
    // a device row, or a client that believes it is signed in.
    const statusResult = await this.authRepo.getAccountStatus(user.id);
    if (!statusResult.ok) return statusResult;
    const refusal = accountAccessRefusal(statusResult.value);
    if (refusal !== null) return fail(refusal);

    const token = await this.tokens.sign({ sub: user.id, email: user.email.value });

    if (this.devices !== null && input.device !== undefined) {
      await this.devices.recordLogin({ userId: user.id, ...input.device }).catch(() => {});
    }

    return ok({ token, user: UserMapper.toDto(user, role) });
  }
}
