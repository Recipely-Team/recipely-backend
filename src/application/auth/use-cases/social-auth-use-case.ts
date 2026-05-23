import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { ITokenSigner } from '@application/auth/ports/i-token-signer';
import type { IFirebaseTokenVerifier } from '@application/auth/ports/i-firebase-token-verifier';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { AuthSessionDto } from '@application/auth/dtos/auth.dto';

export class SocialAuthUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly tokens: ITokenSigner,
    private readonly firebaseVerifier: IFirebaseTokenVerifier,
  ) {}

  async execute(input: { idToken: string }): Promise<Result<AuthSessionDto, Failure>> {
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
    const token = await this.tokens.sign({ sub: user.id, email: user.email.value });
    return ok({ token, user: UserMapper.toDto(user, role) });
  }
}
