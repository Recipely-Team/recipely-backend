import { DisabledRecipeModerator } from '@infrastructure/ai/disabled-recipe-moderator';
import type { ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';

const TEST_REQUEST: ModerateRecipeRequest = {
  title: 'Any Recipe',
  ingredients: ['ingredient 1'],
  instructions: ['step 1'],
};

describe('DisabledRecipeModerator', () => {
  it('always returns ok', async () => {
    const moderator = new DisabledRecipeModerator();

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(true);
  });

  it('always returns status approved', async () => {
    const moderator = new DisabledRecipeModerator();

    const result = await moderator.moderate(TEST_REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('approved');
  });

  it('returns approved even when called multiple times in sequence', async () => {
    const moderator = new DisabledRecipeModerator();

    const results = await Promise.all([
      moderator.moderate(TEST_REQUEST),
      moderator.moderate({ ...TEST_REQUEST, title: 'Another Recipe' }),
    ]);

    for (const result of results) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.status).toBe('approved');
    }
  });
});
