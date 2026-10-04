import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { CuratedGate } from '@application/recipes/curated/curated-gate';
import { curatedGateFailures } from '@application/recipes/curated/curated-gate-failures';
import type { CuratedRecipeInput } from '@application/recipes/curated/curated-recipe-input';

/**
 * Every gate a curated file fails — the file-checkable quality gates and the
 * content moderator over its text, in both languages — as report lines.
 * Empty means it may be published. Touches nothing, so a dry run is this alone.
 */
export const reviewCuratedRecipe = (recipe: CuratedRecipeInput, moderator: ContentModeratorInterface): string[] => {
  const lines = curatedGateFailures(recipe).map((h) => `${h.gate}: ${h.detail}`);
  const text = [
    recipe.name.tr,
    recipe.name.en,
    ...recipe.ingredients.flatMap((i) => [i.label.tr, i.label.en]),
    ...recipe.steps.tr,
    ...recipe.steps.en,
  ].join('\n');
  const verdict = moderator.moderate({ text, context: 'recipe' });
  if (verdict.status === ModerationStatus.Rejected) {
    lines.push(`${CuratedGate.Moderation}: ${verdict.hit.category} ("${verdict.hit.term}")`);
  }
  return lines;
};
