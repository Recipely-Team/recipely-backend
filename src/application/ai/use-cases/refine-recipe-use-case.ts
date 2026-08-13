import { randomUUID } from 'crypto';
import { ok, fail, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { isCuisineKey, CuisineKey } from '@domain/recipes/cuisine-key';
import { isRecipeCategory, RecipeCategory } from '@domain/recipes/recipe-category';
import type { DraftRecipeSnapshot } from '@domain/drafts/recipe-draft';
import type { IRecipeRefiner, RefineTurn } from '@application/ai/ports/i-recipe-refiner';
import type { IContentModerator } from '@application/moderation/ports/i-content-moderator';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';
import type { TranslationService } from '@application/i18n/translation-service';
import { containsInternalLeak } from '@application/ai/leak-sanitizer';

export interface RefineRecipeInput {
  readonly ownerId: string;
  readonly currentRecipe: DraftRecipeSnapshot;
  readonly instruction: string;
  readonly locale: string;
  readonly history?: readonly RefineTurn[];
}

export interface RefineRecipeOutput extends RecipeDto {
  readonly summary: string;
  readonly suggestion: string;
}

export class RefineRecipeUseCase {
  constructor(
    private readonly refiner: IRecipeRefiner,
    private readonly contentModerator: IContentModerator,
    private readonly logger: ILogger,
    private readonly translations: TranslationService,
  ) {}

  async execute(input: RefineRecipeInput): Promise<Result<RefineRecipeOutput, Failure>> {
    const trimmedInstruction = input.instruction.trim();
    if (trimmedInstruction.length === 0) {
      return fail(new UnprocessableFailure('errors.validation.prompt_required', 'instruction'));
    }

    const contentVerdict = this.contentModerator.moderate({ text: trimmedInstruction, context: 'general' });
    if (contentVerdict.status === 'rejected') {
      return fail(contentBlockedFailure(contentVerdict.hit));
    }

    // The replayed history reaches the model exactly like the instruction does,
    // so it is moderated exactly like the instruction. Each turn was screened
    // when it was first sent, but nothing forces a client to send back what it
    // was given — without this, `history` is an unscreened path to the prompt.
    const history = input.history ?? [];
    for (const turn of history) {
      if (turn.role !== 'user') continue;
      const turnVerdict = this.contentModerator.moderate({ text: turn.content, context: 'general' });
      if (turnVerdict.status === 'rejected') {
        return fail(contentBlockedFailure(turnVerdict.hit));
      }
    }

    const refined = await this.refiner.refine({
      currentRecipe: input.currentRecipe,
      instruction: trimmedInstruction,
      locale: input.locale,
      history,
    });

    if (!refined.ok) return refined;

    const { recipe: aiRecipe, summary, suggestion } = refined.value;
    const safeSummary = this.sanitizeSummary(summary, input.locale);
    const safeSuggestion = this.sanitizeSuggestion(suggestion);

    const now = new Date();

    const cuisineRaw = aiRecipe.cuisine.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const cuisine = isCuisineKey(cuisineRaw) ? cuisineRaw : CuisineKey.Other;

    const categoryRaw = aiRecipe.category.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const category = isRecipeCategory(categoryRaw) ? categoryRaw : RecipeCategory.MainCourse;

    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: { [input.locale]: aiRecipe.title },
      cuisine,
      category,
      difficulty: aiRecipe.difficulty,
      ingredients: { [input.locale]: [...aiRecipe.ingredients] },
      instructions: { [input.locale]: [...aiRecipe.instructions] },
      prepTimeMinutes: aiRecipe.prepTimeMinutes,
      cookTimeMinutes: aiRecipe.cookTimeMinutes,
      servings: aiRecipe.servings,
      caloriesPerServing: aiRecipe.caloriesPerServing,
      image: '',
      rating: 0,
      tags: { [input.locale]: [...aiRecipe.tags] },
      mealType: { [input.locale]: [...aiRecipe.mealType] },
      tips: { [input.locale]: [...aiRecipe.tips] },
      media: [],
      ownerId: input.ownerId,
      nutrition: aiRecipe.nutrition,
      isPublished: false,
      moderationStatus: 'pending',
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (!recipeResult.ok) return recipeResult;

    return ok({
      ...RecipeMapper.toDto(recipeResult.value, input.locale),
      summary: safeSummary,
      suggestion: safeSuggestion,
    });
  }

  // Deterministic backstop — the prompt tells the model never to leak
  // internal details, but this is the single provider-agnostic place that
  // guarantees it regardless of which adapter (groq/gemini today, anthropic
  // once it is wired up) answered.
  private sanitizeSummary(summary: string, locale: string): string {
    if (!containsInternalLeak(summary)) return summary;
    this.logger.warn(
      { field: 'summary', snippet: summary.slice(0, 200) },
      'refine_recipe_internal_leak_detected',
    );
    return this.translations.t('ai.refine_leak_summary_fallback', locale);
  }

  // Unlike the summary, a leaking suggestion is dropped rather than replaced:
  // it is an optional extra, so there is nothing to say in its place.
  private sanitizeSuggestion(suggestion: string): string {
    if (!containsInternalLeak(suggestion)) return suggestion;
    this.logger.warn(
      { field: 'suggestion', snippet: suggestion.slice(0, 200) },
      'refine_recipe_internal_leak_detected',
    );
    return '';
  }
}
