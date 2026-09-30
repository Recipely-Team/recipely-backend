import { FallbackAssistantResponder } from '@infrastructure/assistant/fallback-assistant-responder';
import { GroqAssistantResponder } from '@infrastructure/assistant/groq-assistant-responder';
import { AssistantAction } from '@domain/assistant/assistant-action';
import type { AssistantResponderInterface } from '@application/assistant/ports/assistant-responder-interface';
import { ASSISTANT_SYSTEM_INSTRUCTION, assistantToolDefinitions } from '@infrastructure/assistant/assistant-persona';
import Groq from 'groq-sdk';

jest.mock('groq-sdk', () => {
  const mockCreate = jest.fn();
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  (MockGroq as unknown as Record<string, unknown>).__mockCreate = mockCreate;
  (MockGroq as unknown as Record<string, unknown>).APIConnectionTimeoutError = class extends Error {};
  return { default: MockGroq, __esModule: true };
});

/**
 * Recipe generation and photo moderation each got a second provider; the typed
 * assistant did not. So when Gemini answered "This model is currently
 * experiencing high demand" — which production was serving when this was
 * written — typing to the assistant was down for everyone.
 *
 * Voice was unaffected: it runs on the Live API, a different product with its
 * own capacity. Which means the mode that exists to work when voice cannot was
 * the one with nowhere to fall back to.
 */

const REQUEST = { message: 'bu sayfada ne var', languageCode: 'tr', deadline: Date.now() + 60_000 };

const answering = (reply: string, seen: string[], name: string): AssistantResponderInterface => ({
  answer: async () => {
    seen.push(name);
    return { ok: true, value: { reply } };
  },
});

const failing = (seen: string[], name: string): AssistantResponderInterface => ({
  answer: async () => {
    seen.push(name);
    return { ok: false, failure: { code: 'service_unavailable' } as never };
  },
});

describe('the typed assistant chain', () => {
  it('moves on when a provider cannot answer', async () => {
    const seen: string[] = [];
    const chain = new FallbackAssistantResponder([
      failing(seen, 'gemini'),
      answering('tamam', seen, 'groq'),
    ]);

    const result = await chain.answer(REQUEST);

    expect(result.ok && result.value.reply).toBe('tamam');
    expect(seen).toEqual(['gemini', 'groq']);
  });

  it('stops at the first provider that answers', async () => {
    const seen: string[] = [];
    const chain = new FallbackAssistantResponder([
      answering('tamam', seen, 'gemini'),
      answering('başka', seen, 'groq'),
    ]);

    await chain.answer(REQUEST);

    expect(seen).toEqual(['gemini']);
  });

  it('fails only once nobody could answer', async () => {
    const seen: string[] = [];
    const chain = new FallbackAssistantResponder([failing(seen, 'gemini'), failing(seen, 'groq')]);

    const result = await chain.answer(REQUEST);

    expect(result.ok).toBe(false);
    expect(seen).toEqual(['gemini', 'groq']);
  });
});

/**
 * Measured on dev: with Gemini answering "503 high demand" or hanging, a Siri
 * question waited the full 60 seconds Gemini was given — past the 15 the phone
 * waits — so Groq was never asked in time and nobody heard an answer. The chain
 * now shares the request's deadline instead of letting the first seat spend it.
 */
describe('the deadline is shared, not spent by the first seat', () => {
  const recording = (seen: number[], answer: boolean): AssistantResponderInterface => ({
    answer: async (request) => {
      seen.push(request.deadline);
      return answer
        ? { ok: true, value: { reply: 'tamam' } }
        : { ok: false, failure: { code: 'service_unavailable' } as never };
    },
  });

  it('gives each seat an equal part of what is left, and the last seat all of it', async () => {
    const deadlines: number[] = [];
    const chain = new FallbackAssistantResponder(
      [recording(deadlines, false), recording(deadlines, true)],
      () => 1_000,
    );

    await chain.answer({ ...REQUEST, deadline: 13_000 });

    expect(deadlines).toEqual([7_000, 13_000]);
  });

  it('passes the time a fast failure did not use on to the next seat', async () => {
    let clock = 1_000;
    const deadlines: number[] = [];
    const failingInOneSecond: AssistantResponderInterface = {
      answer: async (request) => {
        deadlines.push(request.deadline);
        clock += 1_000;
        return { ok: false, failure: { code: 'service_unavailable' } as never };
      },
    };
    const chain = new FallbackAssistantResponder(
      [failingInOneSecond, recording(deadlines, true)],
      () => clock,
    );

    await chain.answer({ ...REQUEST, deadline: 13_000 });

    // The first seat was offered 6 s and used 1; the second gets the other 11.
    expect(deadlines).toEqual([7_000, 13_000]);
  });

  it('asks nobody once the deadline has passed', async () => {
    const deadlines: number[] = [];
    const chain = new FallbackAssistantResponder([recording(deadlines, true)], () => 20_000);

    const result = await chain.answer({ ...REQUEST, deadline: 13_000 });

    expect(result.ok).toBe(false);
    expect(deadlines).toEqual([]);
  });
});

/**
 * A fallback that answers with a word the app cannot dispatch is worse than no
 * fallback: it turns an outage into a wrong action. Both seats build their tool
 * from the same enum, and this reads the request that actually goes out.
 */
describe('the second seat speaks the same vocabulary', () => {
  it('offers exactly the actions the app dispatches, and no others', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    create.mockResolvedValue({ choices: [{ message: { content: 'tamam' } }] });

    await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: () => undefined } as never,
      model: 'test-model',
    }).answer(REQUEST);

    const sent = create.mock.calls[0]?.[0] as {
      tools: { function: { parameters: { properties: { action: { enum: string[] } } } } }[];
    };
    expect(sent.tools[0]?.function.parameters.properties.action.enum).toEqual(
      Object.values(AssistantAction),
    );
  });

  // The seat used to rebuild the tool with its own two-sentence `arg`
  // description, so a fallback turn never learned the screen names, the draft
  // keys or the diary's JSON argument shapes. It now sends the one declaration.
  it('sends the same tool declaration as the Gemini seats, argument guide included', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    create.mockResolvedValue({ choices: [{ message: { content: 'tamam' } }] });
    create.mockClear();

    await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: () => undefined } as never,
      model: 'test-model',
    }).answer(REQUEST);

    const sent = create.mock.calls[0]?.[0] as {
      tools: { function: { name: string; description: string; parameters: unknown } }[];
    };
    const [declared] = assistantToolDefinitions();
    expect(sent.tools.map((tool) => tool.function)).toEqual([
      { name: declared?.name, description: declared?.description, parameters: declared?.parameters },
    ]);
  });

  // Groq's SDK retries twice by default, each with the full timeout, which is
  // how one turn could outlive the app. Retrying is the chain's job.
  it('makes one attempt, bounded by the deadline it was given', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    create.mockResolvedValue({ choices: [{ message: { content: 'tamam' } }] });
    (Groq as unknown as jest.Mock).mockClear();

    await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: () => undefined } as never,
      model: 'test-model',
    }).answer({ ...REQUEST, deadline: Date.now() + 6_000 });

    const options = (Groq as unknown as jest.Mock).mock.calls[0]?.[0] as { timeout: number; maxRetries: number };
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(6_000);
  });

  // Our own deadline is not the key's fault. Counted against it, a phone turn cut
  // at 6 s would rank a healthy key sick in the pool the app's turn shares.
  it('does not count its own timeout against the key', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    const Timeout = (Groq as unknown as { APIConnectionTimeoutError: new () => Error }).APIConnectionTimeoutError;
    create.mockRejectedValueOnce(new Timeout());
    const failed = jest.fn();

    const result = await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: failed } as never,
      model: 'test-model',
    }).answer(REQUEST);

    expect(result.ok).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  });

  // Measured on dev: this seat answered "How long should I boil an egg?" in
  // Turkish for an app set to en — the typed turn never told it the language.
  it('does not answer an English question in an en app in Turkish', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    create.mockResolvedValue({ choices: [{ message: { content: 'fine' } }] });
    create.mockClear();

    await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: () => undefined } as never,
      model: 'test-model',
    }).answer({ message: 'How long should I boil an egg?', languageCode: 'en', deadline: Date.now() + 60_000 });

    const sent = create.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]?.content).toContain(
      'The app is set to the language "en". Reply in the language the user wrote in; ' +
        'when that is unclear from their message, reply in "en".',
    );
  });

  it('sends the one system instruction, not a second persona', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    create.mockResolvedValue({ choices: [{ message: { content: 'tamam' } }] });

    await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: () => undefined } as never,
      model: 'test-model',
    }).answer(REQUEST);

    const sent = create.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]?.content.startsWith(ASSISTANT_SYSTEM_INSTRUCTION)).toBe(true);
  });
});
