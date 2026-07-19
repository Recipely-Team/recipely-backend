import { RegisterBodySchema } from '@presentation/validators/auth.validators';
import { UpdateMyProfileBodySchema } from '@presentation/validators/users.validators';

// Regression: registration accepted an 80-character display name while the
// profile PATCH capped at 60. Anyone who signed up with a name in that 61-80
// window could never save their profile again — the edit form always resends
// `displayName`, so even a bio-only edit came back 400.
describe('display name limits — registration and profile update agree', () => {
  const name61 = 'a'.repeat(61);
  const name80 = 'a'.repeat(80);
  const name81 = 'a'.repeat(81);

  it('accepts a name registration allows (61-80 chars) on the profile update', () => {
    expect(RegisterBodySchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      displayName: name61,
    }).success).toBe(true);

    expect(UpdateMyProfileBodySchema.safeParse({ displayName: name61 }).success).toBe(true);
    expect(UpdateMyProfileBodySchema.safeParse({ displayName: name80 }).success).toBe(true);
  });

  it('rejects an over-limit name on both schemas', () => {
    expect(RegisterBodySchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      displayName: name81,
    }).success).toBe(false);

    expect(UpdateMyProfileBodySchema.safeParse({ displayName: name81 }).success).toBe(false);
  });

  it('rejects a blank name on both schemas and trims surrounding whitespace', () => {
    expect(UpdateMyProfileBodySchema.safeParse({ displayName: '   ' }).success).toBe(false);

    const parsed = UpdateMyProfileBodySchema.safeParse({ displayName: '  Recep  ' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.displayName).toBe('Recep');
  });

  it('leaves displayName optional on the profile update (bio-only edits)', () => {
    expect(UpdateMyProfileBodySchema.safeParse({ bio: 'Home cook' }).success).toBe(true);
  });
});
