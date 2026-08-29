import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import { createUserPayloadHook } from '@infrastructure/admin/user-payload-hook';

function makeHasher(): IPasswordHasher {
  return {
    hash: jest.fn(async (plain: string) => `hashed:${plain}`),
    verify: jest.fn(async () => true),
  };
}

describe('createUserPayloadHook — password', () => {
  it('hashes a typed password and drops the plain-text field', async () => {
    const hook = createUserPayloadHook(makeHasher());

    const result = await hook({ payload: { email: 'a@b.co', password: 'secret' } });

    expect(result.payload).toEqual({ email: 'a@b.co', passwordHash: 'hashed:secret' });
    expect(result.payload?.password).toBeUndefined();
  });

  it('leaves passwordHash alone when no password was typed', async () => {
    const hasher = makeHasher();
    const hook = createUserPayloadHook(hasher);

    const result = await hook({ payload: { email: 'a@b.co', password: '' } });

    expect(hasher.hash).not.toHaveBeenCalled();
    expect(result.payload).toEqual({ email: 'a@b.co' });
  });
});

describe('createUserPayloadHook — suspension columns', () => {
  // isVisible.edit:false only hides these from the form. The action endpoint
  // writes whatever the payload carries, so without this strip a hand-rolled
  // POST would un-ban (or ban) an account past the use cases and their
  // deleted-account guard.
  it('strips suspendedAt and suspensionReason from the payload', async () => {
    const hook = createUserPayloadHook(makeHasher());

    const result = await hook({
      payload: {
        email: 'a@b.co',
        suspendedAt: null,
        suspensionReason: 'lifted by hand',
      },
    });

    expect(result.payload).toEqual({ email: 'a@b.co' });
  });

  it('strips an attempt to set a suspension, not just to clear one', async () => {
    const hook = createUserPayloadHook(makeHasher());

    const result = await hook({
      payload: { suspendedAt: '2026-08-29T00:00:00Z', suspensionReason: 'spam' },
    });

    expect(result.payload).toEqual({});
  });
});

describe('createUserPayloadHook — empty request', () => {
  it('tolerates a missing payload', async () => {
    const hook = createUserPayloadHook(makeHasher());

    const result = await hook({});

    expect(result.payload).toEqual({});
  });
});
