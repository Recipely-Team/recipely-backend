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

    await build().answer({ deadline: Date.now() + 60_000, message: 'merhaba', languageCode: 'tr-TR' });

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

    const result = await build().answer({ deadline: Date.now() + 60_000, message: 'aç', languageCode: 'tr-TR' });

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

    const result = await build().answer({ deadline: Date.now() + 60_000, message: 'mercimeği aç', languageCode: 'tr-TR' });

    expect(result.ok && result.value).toEqual({
      reply: 'Açıyorum',
      action: { name: 'openRecipe', arg: 'mercimek' },
    });
  });

  it('returns an action that came with no words', async () => {
    respondWith(200, replyOf([{ functionCall: { name: 'runAction', args: { action: 'stop' } } }]));

    const result = await build().answer({ deadline: Date.now() + 60_000, message: 'dur', languageCode: 'tr-TR' });

    expect(result.ok && result.value).toEqual({ reply: '', action: { name: 'stop' } });
  });

  // The screen line rides in the message exactly as it rides in a tool result
  // during a session: a separate turn would double the cost of the one thing
  // the model needs to know.
  it('carries the screen line inside the message', async () => {
    respondWith(200, replyOf([{ text: 'ok' }]));

    await build().answer({ deadline: Date.now() + 60_000, message: 'kaydet', languageCode: 'tr-TR', screenContext: 'screen=/recipes/9' });

    const body = calls[0]?.body as unknown as { contents: { parts: { text: string }[] }[] };
    expect(body.contents[0]?.parts[0]?.text).toContain('kaydet');
    expect(body.contents[0]?.parts[0]?.text).toContain('screen=/recipes/9');
  });

  it('reports unavailable when no key is configured, without calling out', async () => {
    respondWith(200, replyOf([{ text: 'ok' }]));

    const result = await build([]).answer({ deadline: Date.now() + 60_000, message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports unavailable when the model answers nothing usable', async () => {
    respondWith(200, replyOf([]));

    expect((await build().answer({ deadline: Date.now() + 60_000, message: 'merhaba', languageCode: 'tr-TR' })).ok).toBe(false);
  });

  it('reports unavailable when the upstream rejects the call', async () => {
    respondWith(429, { error: { message: 'quota' } });

    expect((await build().answer({ deadline: Date.now() + 60_000, message: 'merhaba', languageCode: 'tr-TR' })).ok).toBe(false);
  });

  // The deadline belongs to whoever is waiting; a seat that is handed one
  // already spent must not start a call that cannot be heard.
  it('does not call Gemini once the deadline has passed', async () => {
    respondWith(200, replyOf([{ text: 'tamam' }]));

    const result = await build().answer({ deadline: Date.now() - 1, message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  // The abort covers reading the body too. Outside the try, a deadline that fired
  // after the headers threw past the chain as a 500 and Groq was never asked.
  it('turns a deadline that fires while reading the body into a failure', async () => {
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    })) as unknown as typeof fetch;
    const failed = jest.fn();
    const responder = new GeminiAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: failed } as never,
      model: 'gemini-flash-latest',
    });

    const result = await responder.answer({ deadline: Date.now() + 60_000, message: 'merhaba', languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  });

  // A typed turn carried its language nowhere, so the model guessed from one
  // short message; on dev the fallback answered an English question in Turkish.
  it('tells the model which language the app is set to', async () => {
    respondWith(200, replyOf([{ text: 'fine' }]));

    await build().answer({ deadline: Date.now() + 60_000, message: 'How long should I boil an egg?', languageCode: 'en-US' });

    const body = calls[0]?.body as unknown as { systemInstruction: { parts: { text: string }[] } };
    expect(body.systemInstruction.parts[0]?.text).toContain('"en-US"');
  });
});
