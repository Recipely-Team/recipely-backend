import { Email } from '@domain/common/email';

describe('Email.create', () => {
  it('returns ok with the normalized value for a valid email', () => {
    const result = Email.create('user@example.com');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('user@example.com');
  });

  it('lower-cases the email so equality is case-insensitive', () => {
    const result = Email.create('User@Example.COM');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('user@example.com');
  });

  it('trims leading and trailing whitespace', () => {
    const result = Email.create('  user@example.com  ');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('user@example.com');
  });

  it.each(['not-an-email', 'missing-at.com', 'user@', '@example.com', 'user @example.com', ''])(
    'returns a ValidationFailure for malformed email %p',
    (raw) => {
      const result = Email.create(raw);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('email');
    },
  );

  it('returns a ValidationFailure for whitespace-only input', () => {
    const result = Email.create('   ');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});
