import { randomUUID } from 'crypto';
import { ok, fail, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { AIGenerationLog } from '@domain/ai/ai-generation-log';
import { isCuisineKey, CuisineKey } from '@domain/recipes/cuisine-key';
import { isRecipeCategory, RecipeCategory } from '@domain/recipes/recipe-category';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { IRecipeGenerator } from '@application/ai/ports/i-recipe-generator';
import type { IPromptModerator } from '@application/ai/ports/i-prompt-moderator';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';

export interface GenerateRecipeInput {
  readonly ownerId: string;
  readonly prompt: string;
  readonly locale: string;
}

// Returns a recipe *preview* — the recipe is NOT persisted. The client decides
// whether to keep it by calling `POST /recipes` with the returned payload. This
// matches the user-facing UX where "generate" only fills the form; "save" is
// the explicit confirmation that creates the recipe.
//
// Two moderation steps:
//  1. Input prompt moderation (IPromptModerator) — rejects profane / sexual /
//     hateful prompts before we spend an LLM call on them.
//  2. Output recipe moderation is deliberately NOT done here anymore: nothing
//     is being published yet, so reviewing the AI's output happens later in
//     CreateRecipeUseCase when the user actually saves it.
export class GenerateRecipeUseCase {
  constructor(
    private readonly generator: IRecipeGenerator,
    private readonly logRepo: IAIGenerationLogRepository,
    private readonly promptModerator: IPromptModerator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: GenerateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const trimmedPrompt = input.prompt.trim();
    if (trimmedPrompt.length === 0) {
      return fail(new UnprocessableFailure('errors.validation.prompt_required', 'prompt'));
    }

    // 1. Input moderation — reject abusive prompts before hitting the generator.
    const promptVerdict = await this.promptModerator.moderate({ prompt: trimmedPrompt });
    if (!promptVerdict.ok) {
      // Upstream moderation failure: fall open (allow). The generator itself
      // has its own safety guardrails and the output is never auto-published
      // — the user must explicitly POST /recipes to save.
      this.logger.warn(
        { code: promptVerdict.failure.code, messageKey: promptVerdict.failure.messageKey },
        'generate_recipe_prompt_moderation_upstream_error — proceeding without input moderation',
      );
    } else if (promptVerdict.value.status === 'rejected') {
      await this.logFailure(
        input.ownerId,
        trimmedPrompt,
        new UnprocessableFailure('errors.ai.prompt_rejected', 'prompt'),
      );
      return fail(new UnprocessableFailure('errors.ai.prompt_rejected', 'prompt'));
    }

    // 2. Generate.
    const generated = await this.generator.generate({
      userPrompt: trimmedPrompt,
      locale: input.locale,
    });

    if (!generated.ok) {
      await this.logFailure(input.ownerId, trimmedPrompt, generated.failure);
      return generated;
    }

    const { recipe: aiRecipe, modelUsed, provider } = generated.value;

    const now = new Date();

    // Map the AI's free-text cuisine/category strings to the matching enum.
    // The AI is told to emit enum keys verbatim, but normalise + fall back to
    // OTHER / MAIN_COURSE so a localized or near-miss response (e.g. "İtalyan",
    // "Italian-American") still produces a valid preview instead of a hard fail.
    const cuisineRaw = aiRecipe.cuisine.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const cuisine = isCuisineKey(cuisineRaw) ? cuisineRaw : CuisineKey.Other;

    const categoryRaw = aiRecipe.category.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const category = isRecipeCategory(categoryRaw) ? categoryRaw : RecipeCategory.MainCourse;

    // Validate by constructing a domain entity (Recipe.create returns a Result
    // and never throws). The entity is then mapped to a DTO and returned —
    // the recipe is NOT persisted; that's the client's choice via POST /recipes.
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
      media: [],
      ownerId: input.ownerId,
      nutrition: aiRecipe.nutrition,
      isPublished: false,
      moderationStatus: 'pending',
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (!recipeResult.ok) {
      await this.logFailure(input.ownerId, trimmedPrompt, recipeResult.failure, provider, modelUsed);
      return recipeResult;
    }

    await this.logSuccess(input.ownerId, trimmedPrompt, provider, modelUsed);
    return ok(RecipeMapper.toDto(recipeResult.value, input.locale));
  }

  private async logSuccess(
    userId: string,
    userPrompt: string,
    provider: string,
    modelUsed: string,
  ): Promise<void> {
    const logResult = AIGenerationLog.create({
      id: randomUUID(),
      userId,
      userPrompt,
      // Always null — the recipe is no longer persisted here. The audit row
      // is still useful for "what did this user ask the AI to make".
      generatedRecipeId: null,
      provider,
      modelUsed,
      status: 'success',
      errorMessage: null,
      createdAt: new Date(),
    });
    if (!logResult.ok) return;
    await this.logRepo.create(logResult.value);
  }

  private async logFailure(
    userId: string,
    userPrompt: string,
    failure: Failure,
    provider = 'unknown',
    modelUsed = 'unknown',
  ): Promise<void> {
    const logResult = AIGenerationLog.create({
      id: randomUUID(),
      userId,
      userPrompt,
      generatedRecipeId: null,
      provider,
      modelUsed,
      status: 'failed',
      errorMessage: `${failure.code}: ${failure.messageKey}`,
      createdAt: new Date(),
    });
    if (!logResult.ok) return;
    await this.logRepo.create(logResult.value);
  }
}
