import {
  DeviceContextBodySchema,
  LoginBodySchema,
  SocialAuthBodySchema,
  VerifyRegistrationBodySchema,
} from '@presentation/validators/auth.validators';

// device is optional everywhere it appears — old app versions that never
// send it must keep logging in without change.

function makeDevice(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { deviceId: 'device-1', platform: 'ios', ...overrides };
}

describe('DeviceContextBodySchema — optionality on host schemas', () => {
  it('parses a login body with no device field at all', () => {
    const result = LoginBodySchema.safeParse({ email: 'user@example.com', password: 'secret123' });
    expect(result.success).toBe(true);
  });

  it('parses a social-auth body with no device field at all', () => {
    const result = SocialAuthBodySchema.safeParse({ idToken: 'firebase-token' });
    expect(result.success).toBe(true);
  });

  it('parses a verify-registration body with no device field at all', () => {
    const result = VerifyRegistrationBodySchema.safeParse({ email: 'user@example.com', code: '123456' });
    expect(result.success).toBe(true);
  });

  it('parses a login body with a well-formed device attached', () => {
    const result = LoginBodySchema.safeParse({
      email: 'user@example.com',
      password: 'secret123',
      device: makeDevice({ appVersion: '1.2.3' }),
    });
    expect(result.success).toBe(true);
  });
});

describe('DeviceContextBodySchema — field validation', () => {
  it('accepts each declared platform', () => {
    for (const platform of ['ios', 'android', 'web']) {
      expect(DeviceContextBodySchema.safeParse(makeDevice({ platform })).success).toBe(true);
    }
  });

  it('rejects a platform outside the enum', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice({ platform: 'windows' }));
    expect(result.success).toBe(false);
  });

  it('rejects an empty deviceId', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice({ deviceId: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects a deviceId over 128 characters', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice({ deviceId: 'a'.repeat(129) }));
    expect(result.success).toBe(false);
  });

  it('accepts a deviceId at exactly 128 characters', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice({ deviceId: 'a'.repeat(128) }));
    expect(result.success).toBe(true);
  });

  it('rejects an appVersion over 32 characters', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice({ appVersion: 'a'.repeat(33) }));
    expect(result.success).toBe(false);
  });

  it('accepts an appVersion at exactly 32 characters', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice({ appVersion: 'a'.repeat(32) }));
    expect(result.success).toBe(true);
  });

  it('leaves appVersion optional', () => {
    const result = DeviceContextBodySchema.safeParse(makeDevice());
    expect(result.success).toBe(true);
  });
});
