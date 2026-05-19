import { randomUUID } from 'crypto';
import { ok, fail, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { AIGenerationLog } from '@domain/ai/ai-generation-log';
import type { ModerationStatus } from '@domain/recipes/moderation-status';
import { isCuisineKey, CuisineKey } from '@domain/recipes/cuisine-key';
import { RecipeCategory } from '@domain/recipes/recipe-category';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { IRecipeGenerator } from '@application/ai/ports/i-recipe-generator';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';

export interface GenerateRecipeInput {
  readonly ownerId: string;
  readonly prompt: string;
  readonly locale: string;
}

export class GenerateRecipeUseCase {
  constructor(
    private readonly generator: IRecipeGenerator,
    private readonly recipeRepo: IRecipeRepository,
    private readonly logRepo: IAIGenerationLogRepository,
    private readonly moderator: IRecipeModerator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: GenerateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const trimmedPrompt = input.prompt.trim();
    if (trimmedPrompt.length === 0) {
      return fail(new UnprocessableFailure('errors.validation.prompt_required', 'prompt'));
    }

    const generated = await this.generator.generate({
      userPrompt: trimmedPrompt,
      locale: input.locale,
    });

    if (!generated.ok) {
      await this.logFailure(input.ownerId, trimmedPrompt, generated.failure);
      return generated;
    }

    const { recipe: aiRecipe, modelUsed, provider } = generated.value;

    const moderateReq: ModerateRecipeRequest = {
      title: aiRecipe.title,
      ingredients: [...aiRecipe.ingredients],
      instructions: [...aiRecipe.instructions],
    };

    let moderationStatus: ModerationStatus;
    let isPublished: boolean;

    const verdictResult = await this.moderator.moderate(moderateReq);
    if (!verdictResult.ok) {
      this.logger.warn(
        { code: verdictResult.failure.code, messageKey: verdictResult.failure.messageKey },
        'generate_recipe_moderation_upstream_error — recipe saved as pending',
      );
      moderationStatus = 'pending';
      isPublished = false;
    } else if (verdictResult.value.status === 'approved') {
      moderationStatus = 'approved';
      isPublished = true;
    } else {
      moderationStatus = 'rejected';
      isPublished = false;
    }

    const now = new Date();

    // Map the AI's free-text cuisine string to the closest CuisineKey enum.
    // The AI may return "ITALIAN", "Italian", or "italian" — normalise to upper-case.
    const cuisineRaw = aiRecipe.cuisine.trim().toUpperCase().replace(/\s+/g, '_');
    const cuisine = isCuisineKey(cuisineRaw) ? cuisineRaw : CuisineKey.Other;

    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: { [input.locale]: aiRecipe.title },
      cuisine,
      category: RecipeCategory.MainCourse,
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
      isPublished,
      moderationStatus,
      createdAt: now,
      updatedAt: now,
    });
    if (!recipeResult.ok) {
      await this.logFailure(input.ownerId, trimmedPrompt, recipeResult.failure, provider, modelUsed);
      return recipeResult;
    }

    const persisted = await this.recipeRepo.create(recipeResult.value);
    if (!persisted.ok) {
      await this.logFailure(input.ownerId, trimmedPrompt, persisted.failure, provider, modelUsed);
      return persisted;
    }

    await this.logSuccess(input.ownerId, trimmedPrompt, persisted.value.id, provider, modelUsed);
    return ok(RecipeMapper.toDto(persisted.value, input.locale));
  }

  private async logSuccess(
    userId: string,
    userPrompt: string,
    recipeId: string,
    provider: string,
    modelUsed: string,
  ): Promise<void> {
    const logResult = AIGenerationLog.create({
      id: randomUUID(),
      userId,
      userPrompt,
      generatedRecipeId: recipeId,
      provider,
      modelUsed,
      status: 'success',
      errorMessage: null,
      createdAt: new Date(),
    });
    if (!logResult.ok) return;
    // Best-effort write — the user's request has already succeeded/failed
    // by this point, so a missing audit row should not propagate. The
    // infrastructure repo logs the underlying error on its own.
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
    // Best-effort write — the user's request has already succeeded/failed
    // by this point, so a missing audit row should not propagate. The
    // infrastructure repo logs the underlying error on its own.
    await this.logRepo.create(logResult.value);
  }
}
