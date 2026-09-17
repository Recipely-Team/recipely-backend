import { TieredKeyPool } from '@infrastructure/ai/keys/tiered-key-pool';
import { AssistantKeyTier } from '@domain/assistant/assistant-key-tier';
import { GeminiLiveSessionMinter } from '@infrastructure/assistant/gemini-live-session-minter';
import { AssistantAction } from '@domain/assistant/assistant-action';
import { assistantTools } from '@infrastructure/assistant/assistant-persona';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

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
    new GeminiLiveSessionMinter({ keys: new TieredKeyPool(keys, []), model: 'models/gemini-3.1-flash-live-preview' });

  const throwOn = (error: unknown): void => {
    global.fetch = (async () => {
      throw error;
    }) as unknown as typeof fetch;
  };

  beforeEach(() => {
    calls = [];
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // The camelCase `authTokens` the docs use answers 404 with an empty body.
  it('posts to the snake_case auth_tokens resource on v1alpha', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=key-1');
  });

  // `liveConnectConstraints`, which the docs name, does not exist — the API
  // answers "Cannot find field" and mints nothing.
  it('carries the setup under bidiGenerateContentSetup', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

    const body = calls[0]?.body as unknown as Record<string, unknown>;
    expect(body['bidiGenerateContentSetup']).toBeDefined();
    expect(body['liveConnectConstraints']).toBeUndefined();
  });

  // The socket is a different RPC method on v1alpha. Connecting to the ordinary
  // BidiGenerateContent with this token as `key=` answers "API key not valid";
  // with `access_token=` it answers "unregistered callers".
  it('returns the constrained socket URL', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    const result = await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

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

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

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

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

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

      await build().mint({ languageCode: 'en-US', userId: 'u1', tier: AssistantKeyTier.Free });

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

    // The request is built by `@live-assistant/token-server` now, and it is the
    // package that spells `object` as `OBJECT`. That spelling is the measured
    // one — the API is not reliably forgiving about case — so it is pinned here
    // rather than trusted to survive an upgrade of a dependency.
    it('declares the tool schema in the upper-case form the API was measured to take', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as {
        tools: {
          functionDeclarations: {
            parameters: { type: string; properties: Record<string, { type: string }> };
          }[];
        }[];
      };
      const parameters = setup.tools[0]?.functionDeclarations[0]?.parameters;
      expect(parameters?.type).toBe('OBJECT');
      expect(parameters?.properties.action?.type).toBe('STRING');
      expect(parameters?.properties.arg?.type).toBe('STRING');
    });

    // The voice is pinned for the product, not per session: left unset the API
    // picks one per socket, so the person on the other end changed on every
    // ten-minute reconnect. It is passed to the package now, which makes it a
    // value that can go missing without anything else noticing.
    it('pins the voice and the tagged language it was asked for', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr', userId: 'u1', tier: AssistantKeyTier.Free });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as {
        generationConfig: {
          speechConfig: { languageCode: string; voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
        };
        systemInstruction: { parts: { text: string }[] };
      };
      expect(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
      // `tr` widened to `tr-TR`: given a code it does not recognise the API
      // stops pinning the language and infers one from the audio instead.
      expect(setup.generationConfig.speechConfig.languageCode).toBe('tr-TR');
      expect(setup.systemInstruction.parts[0]?.text).toContain('Şef');
    });

    it('bakes the resumption handle in, because the socket cannot carry it', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr-TR', resumptionHandle: 'h-3', userId: 'u1', tier: AssistantKeyTier.Free });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as { sessionResumption: unknown };
      expect(setup.sessionResumption).toEqual({ handle: 'h-3' });
    });
    // The typed mode declares the same tool over its own REST call, and the
    // wrapper it sends is built here while the one in the token is built by the
    // package. Two renderings of one declaration can drift on a dependency bump
    // and nothing else would notice: a user speaking and a user typing would
    // simply be offered different words.
    it('offers a typed turn exactly the tool the voice session was minted with', async () => {
      respondWith(200, { name: 'auth_tokens/abc' });

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

      const setup = (calls[0]?.body as unknown as { bidiGenerateContentSetup: Record<string, never> })
        .bidiGenerateContentSetup as unknown as { tools: { functionDeclarations: unknown }[] };
      expect(setup.tools[0]?.functionDeclarations).toEqual(
        (assistantTools()[0] as { functionDeclarations: unknown }).functionDeclarations,
      );
    });
  });

  /**
   * An outage has to be greppable. These three events are what an operator
   * searches on when voice is down, and the reason each one fired is the whole
   * content of the line: the mint is the only place this server learns that
   * Google is unhappy, and the user is told nothing but "unavailable".
   */
  describe('what it leaves in the log', () => {
    it('names Google\'s refusal, with the field it rejected', async () => {
      respondWith(400, { error: { message: 'Cannot find field.' } });

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400, body: expect.stringContaining('Cannot find field.') }),
        'assistant_mint_rejected',
      );
    });

    it('names an answer that carried no token', async () => {
      respondWith(200, { notAName: true });

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('notAName') }),
        'assistant_mint_malformed',
      );
    });

    // The thrown object, not its message. Pino's `err` serializer keeps the type
    // and the stack, which is what separates our own timeout from a DNS failure
    // from a TLS one — and the package reports only `error.message`, so a mint
    // that simply passed the failure through logged a line that said the
    // connection broke without saying how.
    it('keeps the error a failed connection threw, not just its sentence', async () => {
      const timeout = new Error('The operation was aborted due to timeout');
      throwOn(timeout);

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: timeout }),
        'assistant_mint_unreachable',
      );
    });

    // A throw that is not an Error carries no `message`, so the package has no
    // `detail` to report at all: without the object, the line would be the event
    // name and nothing else.
    it('keeps a thrown value that is not an Error at all', async () => {
      throwOn('socket hang up');

      await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: 'socket hang up' }),
        'assistant_mint_unreachable',
      );
    });
  });

  // The start window is what makes a leaked token worthless; the session window
  // has to cover a real conversation. They are not the same number.
  it('mints for one use, with a short start window inside a longer session', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

    const body = calls[0]?.body as unknown as { uses: number; expireTime: string; newSessionExpireTime: string };
    expect(body.uses).toBe(1);
    expect(Date.parse(body.newSessionExpireTime)).toBeLessThan(Date.parse(body.expireTime));
  });

  // Live sessions are rate-limited per key, so a second key is a second
  // allowance of concurrent sessions. This used to ROTATE, which spread one
  // user's sessions across the whole pool — and a single heavy user could then
  // bench every quota the deployment owns inside one conversation. A user now
  // holds one key; the spreading happens BETWEEN users.
  it('serves the same user from the same key', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });
    const minter = build(['key-1', 'key-2']);

    await minter.mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });
    await minter.mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

    const used = calls.map((c) => c.url.split('key=')[1]);
    expect(used[0]).toBe(used[1]);
  });

  it('spreads different users across the configured keys', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });
    const minter = build(['key-1', 'key-2']);

    // Enough distinct users that both keys are certain to be reached.
    for (let user = 0; user < 40; user += 1) {
      await minter.mint({ languageCode: 'tr-TR', userId: `u${user}`, tier: AssistantKeyTier.Free });
    }

    expect(new Set(calls.map((c) => c.url.split('key=')[1]))).toEqual(new Set(['key-1', 'key-2']));
  });

  it('reports unavailable when no key is configured, without calling out', async () => {
    respondWith(200, { name: 'auth_tokens/abc' });

    const result = await build([]).mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports unavailable when Google rejects the mint', async () => {
    respondWith(400, { error: { message: 'Cannot find field.' } });

    expect((await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free })).ok).toBe(false);
  });

  it('reports unavailable when the response carries no token name', async () => {
    respondWith(200, { notAName: true });

    expect((await build().mint({ languageCode: 'tr-TR', userId: 'u1', tier: AssistantKeyTier.Free })).ok).toBe(false);
  });
});
