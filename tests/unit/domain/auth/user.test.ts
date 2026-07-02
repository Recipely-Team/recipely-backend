import { User, type UserProps } from '@domain/auth/user';
import { Email } from '@domain/common/email';

function makeEmail(raw = 'user@example.com'): Email {
  const result = Email.create(raw);
  if (!result.ok) throw new Error('fixture email invalid');
  return result.value;
}

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'user-1',
    email: makeEmail(),
    displayName: 'Jane Cook',
    photoUrl: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('User.create', () => {
  it('returns ok with a User when all props are valid', () => {
    const result = User.create(baseProps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(User);
    expect(result.value.id).toBe('user-1');
    expect(result.value.displayName).toBe('Jane Cook');
    expect(result.value.email.value).toBe('user@example.com');
    expect(result.value.photoUrl).toBeNull();
    expect(result.value.bio).toBeUndefined();
  });

  it('preserves optional bio and photoUrl when provided', () => {
    const result = User.create(baseProps({ bio: 'I love pasta', photoUrl: 'https://example.com/me.jpg' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bio).toBe('I love pasta');
    expect(result.value.photoUrl).toBe('https://example.com/me.jpg');
  });

  it('exposes createdAt and updatedAt as passed in', () => {
    const createdAt = new Date('2025-06-01T00:00:00Z');
    const updatedAt = new Date('2025-06-02T00:00:00Z');
    const result = User.create(baseProps({ createdAt, updatedAt }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.createdAt).toBe(createdAt);
    expect(result.value.updatedAt).toBe(updatedAt);
  });

  describe('validation failures (never throws, returns ValidationFailure)', () => {
    it('fails when id is empty', () => {
      const result = User.create(baseProps({ id: '' }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('id');
    });

    it('fails when id is whitespace only', () => {
      const result = User.create(baseProps({ id: '   ' }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('id');
    });

    it('fails when displayName is empty', () => {
      const result = User.create(baseProps({ displayName: '' }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('displayName');
    });

    it('fails when displayName is whitespace only', () => {
      const result = User.create(baseProps({ displayName: '   ' }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('displayName');
    });
  });
});

describe('User.equals', () => {
  it('treats two users with the same id as equal, regardless of other props', () => {
    const a = User.create(baseProps({ id: 'user-1', displayName: 'Jane' }));
    const b = User.create(baseProps({ id: 'user-1', displayName: 'Different Name' }));
    if (!a.ok || !b.ok) throw new Error('fixtures invalid');

    expect(a.value.equals(b.value)).toBe(true);
  });

  it('treats two users with different ids as not equal', () => {
    const a = User.create(baseProps({ id: 'user-1' }));
    const b = User.create(baseProps({ id: 'user-2' }));
    if (!a.ok || !b.ok) throw new Error('fixtures invalid');

    expect(a.value.equals(b.value)).toBe(false);
  });
});
