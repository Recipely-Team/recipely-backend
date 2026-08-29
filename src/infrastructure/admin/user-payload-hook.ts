import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';

interface PayloadRequest {
  payload?: Record<string, unknown>;
}

// Shared `before` hook for the User resource's new and edit actions.
//
// Two jobs, both server-side on purpose. A plain-text `password` typed in the
// form is hashed and the raw value dropped, so it never reaches the column.
// And `suspendedAt`/`suspensionReason` are stripped: they are hidden from the
// form by `isVisible.edit: false`, but that is cosmetic — the action endpoint
// still writes whatever the payload carries, so a raw POST could otherwise
// suspend or un-suspend an account straight past SuspendUserUseCase /
// UnsuspendUserUseCase, skipping their deleted-account guard entirely.
export function createUserPayloadHook(hasher: IPasswordHasher) {
  return async (request: PayloadRequest): Promise<PayloadRequest> => {
    const payload = request.payload ?? {};

    const password = payload.password;
    if (typeof password === 'string' && password.length > 0) {
      payload.passwordHash = await hasher.hash(password);
    }
    delete payload.password;

    delete payload.suspendedAt;
    delete payload.suspensionReason;

    request.payload = payload;
    return request;
  };
}
