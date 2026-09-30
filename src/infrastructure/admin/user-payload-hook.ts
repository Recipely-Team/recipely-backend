import type { PasswordHasherInterface } from '@application/auth/ports/password-hasher-interface';

// The creator claim moves only through ReviewCreatorTagUseCase (approve/reject
// actions) and the owner's own /me/creator calls — never a raw edit, which
// would skip the handle rules and the one-approved-holder check.
const CREATOR_COLUMNS = ['creatorStatus', 'creatorPlatform', 'creatorHandle', 'creatorRequestedAt', 'creatorReviewedAt'] as const;

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
export function createUserPayloadHook(hasher: PasswordHasherInterface) {
  return async (request: PayloadRequest): Promise<PayloadRequest> => {
    const payload = request.payload ?? {};

    const password = payload.password;
    if (typeof password === 'string' && password.length > 0) {
      payload.passwordHash = await hasher.hash(password);
    }
    delete payload.password;

    delete payload.suspendedAt;
    delete payload.suspensionReason;
    for (const column of CREATOR_COLUMNS) delete payload[column];

    request.payload = payload;
    return request;
  };
}
