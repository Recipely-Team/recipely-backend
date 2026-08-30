import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { ModerationRejection } from '@application/recipes/ports/i-recipe-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

/**
 * Production has a published recipe called "jwwgos", with eight real
 * ingredients under it. The moderator approved it, and rightly by its own
 * lights: the question it was asked is whether a recipe is SAFE, and keyboard
 * mash is perfectly safe.
 *
 * Two rejections, two outcomes. Unsafe content is kept and quietly unpublished,
 * because there is nothing useful to say to whoever wrote it. A meaningless
 * name is the opposite: the user did nothing wrong and can fix it in five
 * seconds — but only if somebody tells them.
 */

const NAME = { tr: 'jwwgos' };

function harness(verdict: ModerationVerdict) {
  const saved: unknown[] = [];
  const repo = {
    create: async (recipe: unknown) => {
      saved.push(recipe);
      return { ok: true, value: recipe };
    },
  } as never;

  const useCase = new CreateRecipeUseCase(
    repo,
    { moderate: async () => ({ ok: true, value: verdict }) } as never,
    { warn: () => undefined, error: () => undefined, info: () => undefined } as never,
    { moderate: () => ({ status: 'approved' }) } as never,
    { findById: async () => ({ ok: true, value: null }) } as never,
    { create: async () => ({ ok: true, value: undefined }) } as never,
  );

  return { useCase, saved };
}

const input = {
  ownerId: 'owner-1',
  name: NAME,
  ingredients: { tr: ['2 yumurta'] },
  instructions: { tr: ['Karıştır'] },
} as never;

describe('a recipe needs a name that means something', () => {
  it('refuses a meaningless name instead of publishing it', async () => {
    const { useCase, saved } = harness({
      status: 'rejected',
      reason: 'title is keyboard mash',
      kind: ModerationRejection.Meaningless,
    });

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.recipe.name_meaningless');
    // Not merely unpublished — never written at all.
    expect(saved).toEqual([]);
  });

  // The existing behaviour, and it must not change: unsafe content is kept so
  // moderation can look at it, and the writer is not lectured.
  it('still keeps unsafe content and unpublishes it quietly', async () => {
    const { useCase, saved } = harness({
      status: 'rejected',
      reason: 'unsafe',
      kind: ModerationRejection.Unsafe,
    });

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
  });

  // A moderator that predates the field says nothing about the title, and that
  // has to keep meaning "safe, publish it".
  it('publishes when the moderator says nothing about the name', async () => {
    const { useCase, saved } = harness({ status: 'approved' });

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
  });
});
