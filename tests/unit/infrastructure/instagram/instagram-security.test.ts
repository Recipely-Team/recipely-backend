import { createHmac } from 'crypto';
import { InstagramTokenCipher } from '@infrastructure/instagram/instagram-token-cipher';
import { JwtConnectStateSigner } from '@infrastructure/instagram/jwt-connect-state-signer';
import { MetaSignatureVerifier } from '@infrastructure/instagram/meta-signature-verifier';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { RandomOneTimeCode } from '@infrastructure/instagram/random-one-time-code';

const SECRET = 'x'.repeat(40);
const APP_SECRET = 'app-secret';

describe('InstagramTokenCipher', () => {
  const cipher = new InstagramTokenCipher(SECRET);

  it('round-trips a token, never storing it in the clear, with a fresh IV each time', () => {
    const a = cipher.encrypt('IGQVJ-secret-token');
    const b = cipher.encrypt('IGQVJ-secret-token');
    expect(a).not.toContain('secret-token');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(cipher.decrypt(a)).toBe('IGQVJ-secret-token');
  });

  it('answers null for a value sealed with another key, or tampered with', () => {
    const sealed = cipher.encrypt('t');
    expect(new InstagramTokenCipher('y'.repeat(40)).decrypt(sealed)).toBeNull();
    expect(cipher.decrypt(`${sealed.slice(0, -2)}AA`)).toBeNull();
    expect(cipher.decrypt('plain-token')).toBeNull();
  });
});

describe('JwtConnectStateSigner', () => {
  const signer = new JwtConnectStateSigner(SECRET);

  it('round-trips the user and return link', async () => {
    const state = await signer.sign({ userId: 'u1', returnTo: 'recipely://instagram' });
    expect(await signer.verify(state)).toEqual({ ok: true, value: { userId: 'u1', returnTo: 'recipely://instagram' } });
  });

  // The state rides in a URL through instagram.com; it must never work as a login.
  it('is refused as a session token, and a session token is refused as a state', async () => {
    const sessions = new JwtTokenSigner({ secret: SECRET, expiresIn: '1h' });
    const state = await signer.sign({ userId: 'u1', returnTo: 'recipely://x' });
    expect((await sessions.verify(state)).ok).toBe(false);
    const session = await sessions.sign({ sub: 'u1', email: 'a@b.c' });
    const asState = await signer.verify(session);
    expect(!asState.ok && asState.failure.messageKey).toBe('errors.instagram.state_invalid');
  });

  it('refuses a state signed with another secret', async () => {
    const state = await new JwtConnectStateSigner('z'.repeat(40)).sign({ userId: 'u1', returnTo: 'recipely://x' });
    expect((await signer.verify(state)).ok).toBe(false);
  });
});

describe('MetaSignatureVerifier', () => {
  const verifier = new MetaSignatureVerifier(APP_SECRET);
  const body = Buffer.from('{"object":"instagram"}');
  const sign = (raw: Buffer, secret = APP_SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  it('accepts the HMAC of the exact raw body', () => {
    expect(verifier.verifyWebhook(body, sign(body))).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['another secret', sign(body, 'other')],
    ['a body changed after signing', sign(Buffer.from('{"object":"instagram" }'))],
    ['sha1', 'sha1=abc'],
    ['a short value', 'sha256=ab'],
  ])('refuses %s', (_label, header) => {
    expect(verifier.verifyWebhook(body, header)).toBe(false);
  });

  const signedRequest = (data: object, secret = APP_SECRET) => {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${createHmac('sha256', secret).update(payload).digest('base64url')}.${payload}`;
  };

  it('reads the Instagram user from a valid signed_request', () => {
    expect(verifier.parseSignedRequest(signedRequest({ user_id: '1784', algorithm: 'HMAC-SHA256' }))).toEqual({ ok: true, value: { igUserId: '1784' } });
    expect(verifier.parseSignedRequest(signedRequest({ user_id: 1784 }))).toEqual({ ok: true, value: { igUserId: '1784' } });
  });

  it.each([
    ['another secret', signedRequest({ user_id: '1' }, 'other')],
    ['no user', signedRequest({})],
    ['garbage', 'abc'],
  ])('refuses a signed_request with %s', (_label, value) => {
    expect(verifier.parseSignedRequest(value).ok).toBe(false);
  });
});

describe('RandomOneTimeCode', () => {
  it('mints unguessable codes and stores only their hash', () => {
    const codes = new RandomOneTimeCode();
    const a = codes.mint();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codes.mint()).not.toBe(a);
    expect(codes.hash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(codes.hash(a)).not.toContain(a);
  });
});
