import { randomUUID } from 'crypto';
import { ok, fail, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { AIGenerationLog } from '@domain/ai/ai-generation-log';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IAIGenerationLogRepository } from '@domain/ai/i-ai-generation-log-repository';
import type { IRecipeGenerator } from '@application/ai/ports/i-recipe-generator';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

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
    const now = new Date();

    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: { [input.locale]: aiRecipe.title },
      cuisine: { [input.locale]: aiRecipe.cuisine },
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
      isPublished: false,
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
