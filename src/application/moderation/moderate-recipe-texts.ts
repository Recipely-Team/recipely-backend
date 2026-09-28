import { fail, ok, type Result } from '@core/result/result';
import type { ValidationFailure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';

/** The free-text fields of a recipe body that the word-list filter reads. */
interface RecipeTexts {
  readonly name?: Record<string, string> | undefined;
  readonly ingredients?: Record<string, string[]> | undefined;
  readonly instructions?: Record<string, string[]> | undefined;
  readonly tags?: Record<string, string[]> | undefined;
  readonly mealType?: Record<string, string[]> | undefined;
  readonly tips?: Record<string, string[]> | undefined;
}

/**
 * Runs the local word-list moderator over every user-written text of a
 * recipe, and refuses on the first hit.
 *
 * Tags, meal types and tips are included because they are rendered verbatim
 * and the AI moderator never sees them. Shared by creating and editing, so the
 * two cannot drift into checking different fields.
 */
export const moderateRecipeTexts = (
  moderator: ContentModeratorInterface,
  texts: RecipeTexts,
): Result<void, ValidationFailure> => {
  const all = [
    ...Object.values(texts.name ?? {}),
    ...Object.values(texts.ingredients ?? {}).flat(),
    ...Object.values(texts.instructions ?? {}).flat(),
    ...Object.values(texts.tags ?? {}).flat(),
    ...Object.values(texts.mealType ?? {}).flat(),
    ...Object.values(texts.tips ?? {}).flat(),
  ];
  for (const text of all) {
    const verdict = moderator.moderate({ text, context: 'recipe' });
    if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));
  }
  return ok(undefined);
};
