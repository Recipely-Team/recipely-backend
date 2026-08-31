import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The assistant's typed turn was answered with "the request did not arrive",
 * and it was our own abort: the app waits 90 seconds for an AI call and this
 * responder gave up at 15. The binding limit was the server's and it was six
 * times tighter than the client's, so a turn that took twenty seconds — which
 * is ordinary for one that has to pick a tool — died on our side while the
 * client sat waiting for a reply that had already been cancelled.
 *
 * Read out of the source rather than imported: the constant is deliberately
 * module-private, and what needs pinning is the NUMBER and its relationship to
 * the client's, not a symbol anyone should be able to reach for.
 */

const responderSource = (): string =>
  readFileSync(
    join(__dirname, '../../../../src/infrastructure/assistant/gemini-assistant-responder.ts'),
    'utf8',
  );

/** `AI_REQUEST_TIMEOUT_MS` in the app's `infrastructure/constants/api/api-timeouts.ts`. */
const CLIENT_TIMEOUT_MS = 90_000;

describe('how long a typed turn may take', () => {
  const timeout = Number(
    /const REQUEST_TIMEOUT_MS = ([\d_]+);/.exec(responderSource())?.[1]?.replace(/_/g, ''),
  );

  it('gives a tool-choosing turn room to finish', () => {
    expect(timeout).toBeGreaterThanOrEqual(30_000);
  });

  /**
   * The server has to be the one that gives up first: only it can answer with a
   * failure the app knows how to say out loud. A client that times out first
   * has nothing to show but its own silence.
   */
  it('still gives up before the app does', () => {
    expect(timeout).toBeLessThan(CLIENT_TIMEOUT_MS);
  });
});
