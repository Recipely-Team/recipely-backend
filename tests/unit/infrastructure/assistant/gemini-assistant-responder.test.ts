import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { AssistantAction } from '@domain/assistant/assistant-action';
import { GeminiAssistantResponder } from '@infrastructure/assistant/gemini-assistant-responder';

/**
 * The typed turn must be the SAME assistant as the spoken one — same
 * instruction, same tool, same action vocabulary — or the app behaves
 * differently depending on whether the user's hands were free.
 */
describe('GeminiAssistantResponder', () => {
  const originalFetch = global.fetch;
  let calls: { url: string; body: Record<string, never> }[];

  const respondWith = (status: number, payload: unknown): void => {
    global.fetch = (async (url: string, init: { body: string }) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
    }) as unknown as typeof fetch;
  };

  const build = (keys: string[] = ['key-1']) =>
    new GeminiAssistantResponder({ keys: new ApiKeyPool(keys), model: 'gemini-flash-latest' });

  const replyOf = (parts: unknown[]): unknown => ({ candidates: [{ content: { parts } }] });

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('offers the same tool and vocabulary a voice session gets', async () => {
    respondWith(200, replyOf([{ text: 'tamam' }]));

    await build().answer({ message: 'merhaba', languageCode: 'tr-TR' });

    const body = calls[0]?.body as unknown as {
      tools: { functionDeclarations: { name: string; parameters: { properties: { action: { enum: string[] } } } }[] }[];
      systemInstruction: { parts: { text: string }[] };
    };
    expect(body.tools[0]?.functionDeclarations[0]?.name).toBe('runAction');
    expect(body.tools[0]?.functionDeclarations[0]?.parameters.properties.action.enum).toEqual(
      Object.values(AssistantAction),
    );
    expect(body.systemInstruction.parts[0]?.text).toMatch(/runAction/);
  });

  it('returns what the model said', async () => {
    respondWith(200, replyOf([{ text: 'Tarifi açıyorum' }]));

    const result = await build().answer({ message: 'aç', languageCode: 'tr-TR' });

    expect(result.ok && result.value).toEqual({ reply: 'Tarifi açıyorum' });
  });

  it('returns the action the model chose, alongside what it said', async () => {
    respondWith(
      200,
      replyOf([
        { text: 'Açıyorum' },
        { functionCall: { name: 'runAction', args: { action: 'openRecipe', arg: 'mercimek' } } },
      ]),
    );

    const result = await build().answer({ message: 'mercimeği aç', languageCode: 'tr-TR' });

    expect(result.ok && result.value).toEqual({
      reply: 'Açıyorum',
      action: { name: 'openRecipe', arg: 'mercimek' },
    });
  });

  it('returns an action that came with no words', async () => {
    respondWith(200, replyOf([{ functionCall: { name: 'runAction', args: { action: 'stop' } } }]));

    const result = await build().answer({ message: 'dur', languageCode: 'tr-TR' });

    expect(result.ok && result.value).toEqual({ reply: '', action: { name: 'stop' } });
  });

  // The screen line rides in the message exactly as it rides in a tool result
  // during a session: a separate turn would double the cost of the one thing
  // the model needs to know.
  it('carries the screen line inside the message', async () => {
    respondWith(200, replyOf([{ text: 'ok' }]));

    await build().answer({ message: 'kaydet', languageCode: 'tr-TR', screenContext: 'screen=/recipes/9' });

    const body = calls[0]?.body as unknown as { contents: { parts: { text: string }[] }[] };
    expect(body.contents[0]?.parts[0]?.text).toContain('kaydet');
    expect(body.contents[0]?.parts[0]?.text).toContain('screen=/recipes/9');
  });

  it('reports unavailable when no key is configured, without calling out', async () => {
    respondWith(200, replyOf([{ text: 'ok' }]));

    const result = await build([]).answer({ message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports unavailable when the model answers nothing usable', async () => {
    respondWith(200, replyOf([]));

    expect((await build().answer({ message: 'merhaba', languageCode: 'tr-TR' })).ok).toBe(false);
  });

  it('reports unavailable when the upstream rejects the call', async () => {
    respondWith(429, { error: { message: 'quota' } });

    expect((await build().answer({ message: 'merhaba', languageCode: 'tr-TR' })).ok).toBe(false);
  });
});

/**
 * Reported from the web app: a typed question came back as "this request did
 * not go through". The dev box's logs named the cause exactly — five
 * `assistant_message_rejected` lines in one afternoon, every one a 503 reading
 * "this model is currently experiencing high demand", plus one request that
 * timed out. Each was one attempt and then a shrug, and asking again would
 * have worked. So the transient half of that is now retried, and the
 * permanent half still is not: three attempts at a request the provider will
 * reject identically every time only make the user wait longer for the same
 * answer.
 */
describe('GeminiAssistantResponder — a busy model is not a dead end', () => {
  const originalFetch = global.fetch;
  let statuses: number[];
  let attempts: number;

  /** Answers with each status in turn, then 200 with a usable reply. */
  const respondInTurn = (queue: number[]): void => {
    statuses = [...queue];
    attempts = 0;
    global.fetch = (async () => {
      attempts += 1;
      const status = statuses.shift();
      if (status === undefined) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'tamam' }] } }] }),
        };
      }
      return { ok: false, status, text: async () => '{"error":{"code":503}}' };
    }) as unknown as typeof fetch;
  };

  const build = (keys: string[] = ['key-1', 'key-2']) =>
    new GeminiAssistantResponder({ keys: new ApiKeyPool(keys), model: 'gemini-flash-latest' });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('answers on the second attempt when the model was busy on the first', async () => {
    respondInTurn([503]);

    const result = await build().answer({ message: 'baklava tarifi bul', languageCode: 'tr-TR' });

    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it('gives up after three attempts rather than retrying forever', async () => {
    respondInTurn([503, 503, 503, 503]);

    const result = await build().answer({ message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(attempts).toBe(3);
  });

  it('does not retry a request the provider says is wrong', async () => {
    respondInTurn([400]);

    const result = await build().answer({ message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(attempts).toBe(1);
  });

  it('retries a reply that carried neither words nor an action', async () => {
    attempts = 0;
    global.fetch = (async () => {
      attempts += 1;
      const empty = attempts === 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ candidates: [{ content: { parts: empty ? [] : [{ text: 'tamam' }] } }] }),
      };
    }) as unknown as typeof fetch;

    const result = await build().answer({ message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
  });
});
