import { randomUUID } from 'crypto';
import { ok, fail, type Result } from '@core/result/result';
import { UnprocessableFailure, ValidationFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { AIGenerationLog } from '@domain/ai/ai-generation-log';
import { isCuisineKey, CuisineKey } from '@domain/recipes/cuisine-key';
import { isRecipeCategory, RecipeCategory } from '@domain/recipes/recipe-category';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { IInstagramRecipeImporter } from '@application/ai/ports/i-instagram-recipe-importer';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';

const ALLOWED_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const TIMEOUT_MS = 120_000;

export interface ImportInstagramRecipeInput {
  readonly ownerId: string;
  readonly url: string;
  readonly locale: string;
}

export class ImportInstagramRecipeUseCase {
  constructor(
    private readonly importer: IInstagramRecipeImporter,
    private readonly logRepo: IAIGenerationLogRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(input: ImportInstagramRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const trimmedUrl = input.url.trim();
    if (trimmedUrl.length === 0) {
      return fail(new ValidationFailure('errors.import.invalid_url', 'url'));
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      return fail(new ValidationFailure('errors.import.invalid_url', 'url'));
    }

    if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      return fail(new ValidationFailure('errors.import.not_instagram', 'url'));
    }

    const signal = AbortSignal.timeout(TIMEOUT_MS);

    const imported = await this.importer.import({
      url: trimmedUrl,
      locale: input.locale,
      signal,
    });

    if (!imported.ok) {
      await this.logFailure(input.ownerId, trimmedUrl, imported.failure);
      return imported;
    }

    const { recipe: aiRecipe, modelUsed, provider } = imported.value;

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
      await this.logFailure(input.ownerId, trimmedUrl, recipeResult.failure, provider, modelUsed);
      return recipeResult;
    }

    await this.logSuccess(input.ownerId, trimmedUrl, provider, modelUsed);
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
