import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import type { RecipeProps } from '@domain/recipes/recipe-props';

/**
 * The fields an owner may rewrite on a private recipe. Absent means unchanged;
 * a localized field that is present replaces the whole record.
 */
export interface RecipeContentEdit {
  readonly name?: Record<string, string> | undefined;
  readonly cuisine?: CuisineKey | undefined;
  readonly category?: RecipeCategory | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly ingredients?: Record<string, string[]> | undefined;
  readonly instructions?: Record<string, string[]> | undefined;
  readonly prepTimeMinutes?: number | undefined;
  readonly cookTimeMinutes?: number | undefined;
  readonly servings?: number | undefined;
  readonly caloriesPerServing?: number | undefined;
  readonly tags?: Record<string, string[]> | undefined;
  readonly tips?: Record<string, string[]> | undefined;
  readonly nutrition?: RecipeNutrition | undefined;
}

/**
 * What a recipe's props become after its owner edits it.
 *
 * @remarks
 * - **Only while private.** A public recipe is text other people are reading,
 *   liking and commenting on; changing it under them would make every one of
 *   those about something else. Unpublish first.
 * - **A rejection survives the edit; anything else goes back to `unreviewed`.**
 *   A pending review was of the old text, and an admin approving it would
 *   publish words nobody looked at. A rejection is kept so an edit cannot be
 *   used to shake one off — publishing is where the text is judged again.
 * - **Provenance and the imported fingerprint are never touched**, which is
 *   how the copyright gate sees the difference between what was imported and
 *   what the owner has written since.
 */
export const applyContentEdit = (
  props: RecipeProps,
  edit: RecipeContentEdit,
  now: Date,
): Result<RecipeProps, ConflictFailure> => {
  if (props.isPublished) return fail(new ConflictFailure('errors.recipe.edit_published'));
  const changes = Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)) as Partial<RecipeProps>;
  return ok({
    ...props,
    ...changes,
    moderationStatus:
      props.moderationStatus === ModerationStatus.Rejected ? ModerationStatus.Rejected : ModerationStatus.Unreviewed,
    updatedAt: now,
  });
};
