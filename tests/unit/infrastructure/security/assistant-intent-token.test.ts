import jwt from 'jsonwebtoken';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { JwtAssistantIntentTokenSigner } from '@infrastructure/security/jwt-assistant-intent-token-signer';
import { AssistantTokenScope } from '@domain/assistant/assistant-token-scope';

/**
 * The pair of refusals this feature rests on.
 *
 * An intent token is written into a container the phone's own assistant can read
 * — an iOS App Group, Android preferences — which is a wider audience than the
 * app's keychain. It is signed with the same secret as a session JWT, so the only
 * thing keeping the two apart is that each verifier checks the `scope` claim.
 * If either check is ever dropped, nothing else in the system notices: both
 * tokens keep working, one of them just buys an account.
 */
const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30;

const payload = { sub: 'user-1', email: 'cook@example.com' };

describe('assistant intent token', () => {
  const sessions = new JwtTokenSigner({ secret: SECRET, expiresIn: '7d' });
  const intents = new JwtAssistantIntentTokenSigner({ secret: SECRET, lifetimeSeconds: THIRTY_DAYS_SEC });

  it('round-trips the identity it was minted for', async () => {
    const token = await intents.sign(payload);

    await expect(intents.verify(token)).resolves.toEqual({ ok: true, value: payload });
  });

  it('carries the scope claim that tells the two tokens apart', async () => {
    const token = await intents.sign(payload);

    const decoded = jwt.verify(token, SECRET) as { scope?: unknown };

    expect(decoded.scope).toBe(AssistantTokenScope.Intent);
  });

  // The half that matters: without it, a token left where the OS assistant can
  // read it would be accepted on every authenticated route in the API.
  it('is NOT accepted as a session', async () => {
    const token = await intents.sign(payload);

    const result = await sessions.verify(token);

    expect(result.ok).toBe(false);
  });

  // The other direction: the app's own session must not be usable on the
  // headless path either, or "narrow scope" would describe nothing.
  it('does not accept a session token in its place', async () => {
    const sessionToken = await sessions.sign(payload);

    const result = await intents.verify(sessionToken);

    expect(result.ok).toBe(false);
  });

  // A scope nobody has implemented yet must not default into being a session.
  it('refuses a token carrying any other scope, as a session and as an intent', async () => {
    const odd = jwt.sign({ ...payload, scope: 'somethingElse' }, SECRET);

    await expect(sessions.verify(odd)).resolves.toMatchObject({ ok: false });
    await expect(intents.verify(odd)).resolves.toMatchObject({ ok: false });
  });

  it('still accepts an ordinary session, so the guard is not refusing everyone', async () => {
    const sessionToken = await sessions.sign(payload);

    await expect(sessions.verify(sessionToken)).resolves.toEqual({ ok: true, value: payload });
  });

  it('refuses an expired intent token', async () => {
    const expired = new JwtAssistantIntentTokenSigner({ secret: SECRET, lifetimeSeconds: -1 });
    const token = await expired.sign(payload);

    const result = await intents.verify(token);

    expect(result.ok).toBe(false);
  });

  it('refuses one signed with a different secret', async () => {
    const other = new JwtAssistantIntentTokenSigner({
      secret: 'another-secret-that-is-also-at-least-32-chars',
      lifetimeSeconds: THIRTY_DAYS_SEC,
    });
    const token = await other.sign(payload);

    const result = await intents.verify(token);

    expect(result.ok).toBe(false);
  });
});
