import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeContentEdit } from '@domain/recipes/editing/recipe-content-edit';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { moderateRecipeTexts } from '@application/moderation/moderate-recipe-texts';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

export interface EditRecipeInput {
  readonly recipeId: string;
  readonly requesterId: string;
  readonly changes: RecipeContentEdit;
  readonly locale: string;
}

/**
 * Lets the owner rewrite a recipe they have saved but not published.
 *
 * @remarks
 * - **Private only.** A public recipe answers `conflict`
 *   (`errors.recipe.edit_published`): unpublish, edit, publish again. The
 *   rule lives on the entity (`Recipe.edit`); the repository re-checks it in
 *   the write itself, so a publish racing the edit cannot be written under.
 * - **Only the local word-list moderator runs here.** The AI moderator judges
 *   what is PUBLISHED, and runs when the owner asks for that; an edit to a
 *   private recipe shows nobody anything.
 * - **The copyright gate follows the text.** Provenance and the imported
 *   fingerprint are never written by an edit, so the returned
 *   `publishBlockers` are recomputed from what the owner has now written.
 * - **Owner only**, `forbidden` for anyone else who can see the recipe.
 */
export class EditRecipeUseCase {
  constructor(
    private readonly repo: RecipeRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
  ) {}

  async execute(input: EditRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;

    const { recipe, social } = found.value;
    if (recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const edited = recipe.edit(input.changes, new Date());
    if (!edited.ok) return edited;

    const clean = moderateRecipeTexts(this.contentModerator, input.changes);
    if (!clean.ok) return clean;

    const saved = await this.repo.saveContent(edited.value);
    if (!saved.ok) return saved;

    return ok(RecipeMapper.toDto(edited.value, input.locale, social, input.requesterId));
  }
}
