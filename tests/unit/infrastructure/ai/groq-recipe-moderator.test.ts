/**
 * GroqRecipeModerator unit tests.
 *
 * The Groq SDK is mocked at the module level so no real HTTP calls are made.
 * The moderator is constructed with a fake API key; only the chat.completions
 * factory method is relevant to these tests.
 */

// Mock must be declared before any import that triggers the module.
jest.mock('groq-sdk', () => {
  const mockCreate = jest.fn();
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  // Expose mockCreate so individual tests can configure it.
  (MockGroq as unknown as Record<string, unknown>).__mockCreate = mockCreate;
  return { default: MockGroq, __esModule: true };
});

import Groq from 'groq-sdk';
import { GroqRecipeModerator } from '@infrastructure/ai/groq-recipe-moderator';
import type { ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';

// Retrieve the shared mockCreate reference exposed by the factory above.
const mockCreate = (Groq as unknown as Record<string, unknown>).__mockCreate as jest.Mock;

const TEST_REQUEST: ModerateRecipeRequest = {
  title: 'Spaghetti Carbonara',
  ingredients: ['pasta', 'eggs', 'guanciale'],
  instructions: ['boil pasta', 'mix eggs', 'combine'],
};

function makeConfig() {
  return { apiKey: 'test-key', model: 'test-model' };
}

function mockCompletion(content: string) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content } }],
  });
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe('GroqRecipeModerator — approved path', () => {
  it('returns ok with status approved when API returns safe=true', async () => {
    mockCompletion(JSON.stringify({ safe: true, reason: '' }));
    const moderator = new GroqRecipeModerator(makeConfig());

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('approved');
  });
});

describe('GroqRecipeModerator — rejected path', () => {
  it('returns ok with status rejected and the reason when API returns safe=false', async () => {
    const reason = 'Recipe contains harmful instructions';
    mockCompletion(JSON.stringify({ safe: false, reason }));
    const moderator = new GroqRecipeModerator(makeConfig());

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('rejected');
    if (result.value.status !== 'rejected') return;
    expect(result.value.reason).toBe(reason);
  });
});

describe('GroqRecipeModerator — upstream error path', () => {
  it('returns fail with UnknownFailure when the Groq client throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network timeout'));
    const moderator = new GroqRecipeModerator(makeConfig());

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });
});

describe('GroqRecipeModerator — malformed JSON path', () => {
  it('returns fail with UnknownFailure when the API returns unparseable content', async () => {
    mockCompletion('not valid json at all {{}}');
    const moderator = new GroqRecipeModerator(makeConfig());

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });

  it('returns fail with UnknownFailure when the API returns JSON that fails schema validation', async () => {
    // Valid JSON but missing required fields
    mockCompletion(JSON.stringify({ verdict: 'ok' }));
    const moderator = new GroqRecipeModerator(makeConfig());

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });
});
