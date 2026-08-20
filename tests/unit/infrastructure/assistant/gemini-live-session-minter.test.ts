import { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { GeminiLiveSessionMinter } from '@infrastructure/assistant/gemini-live-session-minter';
import { AssistantAction } from '@domain/assistant/assistant-action';

/**
 * Every URL and field name here was measured against the live API, because the
 * documented form of each one fails differently and none of them fail loudly
 * at compile time. These tests exist so a future "tidy-up" toward the docs is
 * caught here rather than by a session that never starts.
 */
describe('GeminiLiveSessionMinter', () => {
  const originalFetch = global.fetch;
  let calls: { url: string; body: Record<string, never> }[];

  const respondWith = (status: number, payload: unknown): void => {
    global.fetch = (async (url: string, init: { body: string }) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
    }) as unknown as typeof fetch;
  };

  const build = (keys: string[] = ['key-1']) =>
    new GeminiLiveSessionMinter({ keys: new ApiKeyPool(keys), model: 'models/gemini-3.1-flash-live-preview' });

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // The camelCase `authTokens` the docs use answers 404 with an empty body.
  it('posts to the snake_case auth_tokens resource on v1alpha', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    await build().mint({ languageCode: 'tr-TR' });

    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=key-1');
  });

  // `liveConnectConstraints`, which the docs name, does not exist — the API
  // answers "Cannot find field" and mints nothing.
  it('carries the setup under bidiGenerateContentSetup', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    await build().mint({ languageCode: 'tr-TR' });

    const body = calls[0]?.body as unknown as Record<string, unknown>;
    expect(body['bidiGenerateContentSetup']).toBeDefined();
    expect(body['liveConnectConstraints']).toBeUndefined();
  });

  // The socket is a different RPC method on v1alpha. Connecting to the ordinary
  // BidiGenerateContent with this token as `key=` answers "API key not valid";
  // with `access_token=` it answers "unregistered callers".
  it('returns the constrained socket URL', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    const result = await build().mint({ languageCode: 'tr-TR' });

    expect(result.ok && result.value.wsUrl).toBe(
      'wss://generativelanguage.googleapis.com/ws/' +
        'google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
    );
  });

  // The client's own setup frame is discarded, so anything absent here is
  // absent from the session — silently, with no error at connect time.
  describe('the setup it bakes in', () => {
    it('declares exactly one tool, carrying the whole action vocabulary', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr-TR' });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as {
        tools: { functionDeclarations: { name: string; parameters: { properties: { action: { enum: string[] } } } }[] }[];
      };
      expect(setup.tools).toHaveLength(1);
      expect(setup.tools[0]?.functionDeclarations).toHaveLength(1);
      expect(setup.tools[0]?.functionDeclarations[0]?.name).toBe('runAction');
      expect(setup.tools[0]?.functionDeclarations[0]?.parameters.properties.action.enum).toEqual(
        Object.values(AssistantAction),
      );
    });

    // Measured: with the language rule only in the system instruction, a user
    // asking in Turkish got `arg: "chicken, yogurt"`. A field description is
    // read at the moment the field is filled, which is where it holds — and it
    // matters because this argument is what the recipe generator works from, so
    // a translated one quietly swaps the language the request is answered in.
    it('tells the model, on the argument itself, not to translate it', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr-TR' });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as {
        tools: { functionDeclarations: { parameters: { properties: { arg: { description: string } } } }[] }[];
      };
      const description = setup.tools[0]?.functionDeclarations[0]?.parameters.properties.arg.description ?? '';
      expect(description).toMatch(/SAME LANGUAGE/);
      expect(description).toMatch(/[Nn]ever translate/);
    });

    it('asks for audio only, with both transcriptions and compression on', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'en-US' });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as {
        generationConfig: { responseModalities: string[]; speechConfig: { languageCode: string } };
        inputAudioTranscription: unknown;
        outputAudioTranscription: unknown;
        contextWindowCompression: unknown;
      };
      expect(setup.generationConfig.responseModalities).toEqual(['AUDIO']);
      expect(setup.generationConfig.speechConfig.languageCode).toBe('en-US');
      expect(setup.inputAudioTranscription).toEqual({});
      expect(setup.outputAudioTranscription).toEqual({});
      expect(setup.contextWindowCompression).toEqual({ slidingWindow: {} });
    });

    it('bakes the resumption handle in, because the socket cannot carry it', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr-TR', resumptionHandle: 'h-3' });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as { sessionResumption: unknown };
      expect(setup.sessionResumption).toEqual({ handle: 'h-3' });
    });
  });

  // The start window is what makes a leaked token worthless; the session window
  // has to cover a real conversation. They are not the same number.
  it('mints for one use, with a short start window inside a longer session', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    await build().mint({ languageCode: 'tr-TR' });

    const body = calls[0]?.body as unknown as { uses: number; expireTime: string; newSessionExpireTime: string };
    expect(body.uses).toBe(1);
    expect(Date.parse(body.newSessionExpireTime)).toBeLessThan(Date.parse(body.expireTime));
  });

  // Live sessions are rate-limited per key, so a second key is a second
  // allowance of concurrent sessions — the only lever on the free tier.
  it('spreads sessions across the configured keys', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });
    const minter = build(['key-1', 'key-2']);

    await minter.mint({ languageCode: 'tr-TR' });
    await minter.mint({ languageCode: 'tr-TR' });

    expect(calls.map((c) => c.url.split('key=')[1])).toEqual(['key-1', 'key-2']);
  });

  it('reports unavailable when no key is configured, without calling out', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    const result = await build([]).mint({ languageCode: 'tr-TR' });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports unavailable when Google rejects the mint', async () => {
    respondWith(400, { error: { message: 'Cannot find field.' } });

    expect((await build().mint({ languageCode: 'tr-TR' })).ok).toBe(false);
  });

  it('reports unavailable when the response carries no token name', async () => {
    respondWith(200, { notAName: true });

    expect((await build().mint({ languageCode: 'tr-TR' })).ok).toBe(false);
  });
});
