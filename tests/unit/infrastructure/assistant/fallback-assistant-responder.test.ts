import { FallbackAssistantResponder } from '@infrastructure/assistant/fallback-assistant-responder';
import { GroqAssistantResponder } from '@infrastructure/assistant/groq-assistant-responder';
import { AssistantAction } from '@domain/assistant/assistant-action';
import type { AssistantResponderInterface } from '@application/assistant/ports/assistant-responder-interface';
import { ASSISTANT_SYSTEM_INSTRUCTION } from '@infrastructure/assistant/live-setup';
import Groq from 'groq-sdk';

jest.mock('groq-sdk', () => {
  const mockCreate = jest.fn();
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  (MockGroq as unknown as Record<string, unknown>).__mockCreate = mockCreate;
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

const REQUEST = { message: 'bu sayfada ne var', languageCode: 'tr' };

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

  it('sends the one system instruction, not a second persona', async () => {
    const create = (Groq as unknown as { __mockCreate: jest.Mock }).__mockCreate;
    create.mockResolvedValue({ choices: [{ message: { content: 'tamam' } }] });

    await new GroqAssistantResponder({
      keys: { next: () => 'k', size: 1, succeed: () => undefined, fail: () => undefined } as never,
      model: 'test-model',
    }).answer(REQUEST);

    const sent = create.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]?.content).toBe(ASSISTANT_SYSTEM_INSTRUCTION);
  });
});
