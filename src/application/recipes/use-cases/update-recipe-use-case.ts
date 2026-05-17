import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, NotFoundFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/recipe-media';
import type { ModerationStatus } from '@domain/recipes/moderation-status';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';
import { randomUUID } from 'crypto';

export interface UpdateRecipeMediaInput {
  readonly type: MediaType;
  readonly url: string;
}

export interface UpdateRecipeInput {
  readonly id: string;
  readonly requesterId: string;
  readonly name?: Record<string, string>;
  readonly cuisine?: Record<string, string>;
  readonly difficulty?: Difficulty;
  readonly ingredients?: Record<string, string[]>;
  readonly instructions?: Record<string, string[]>;
  readonly prepTimeMinutes?: number;
  readonly cookTimeMinutes?: number;
  readonly servings?: number;
  readonly caloriesPerServing?: number;
  readonly image?: string;
  readonly rating?: number;
  readonly tags?: Record<string, string[]>;
  readonly mealType?: Record<string, string[]>;
  readonly media?: UpdateRecipeMediaInput[];
  readonly nutrition?: { protein?: number | undefined; carbs?: number | undefined; fat?: number | undefined; fiber?: number | undefined };
  readonly locale?: string;
}

export class UpdateRecipeUseCase {
  constructor(
    private readonly repo: IRecipeRepository,
    private readonly moderator: IRecipeModerator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: UpdateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const locale = input.locale ?? 'en';

    const found = await this.repo.getById(input.id);
    if (!found.ok) return found;

    const existing = found.value;
    if (existing.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const raw = existing.toRaw();

    // Detect whether moderation-sensitive fields changed.
    const nameChanged = input.name !== undefined;
    const ingredientsChanged = input.ingredients !== undefined;
    const instructionsChanged = input.instructions !== undefined;
    const needsRemoderation = nameChanged || ingredientsChanged || instructionsChanged;

    const mergedName = input.name !== undefined ? input.name : raw.name;
    const mergedIngredients = input.ingredients !== undefined ? input.ingredients : raw.ingredients;
    const mergedInstructions = input.instructions !== undefined ? input.instructions : raw.instructions;

    let moderationStatus: ModerationStatus = raw.moderationStatus;
    let isPublished: boolean = raw.isPublished;

    if (needsRemoderation) {
      const moderateReq: ModerateRecipeRequest = {
        title: Object.values(mergedName)[0] ?? '',
        ingredients: Object.values(mergedIngredients)[0] ?? [],
        instructions: Object.values(mergedInstructions)[0] ?? [],
      };

      const verdictResult = await this.moderator.moderate(moderateReq);
      if (!verdictResult.ok) {
        this.logger.warn(
          { code: verdictResult.failure.code, messageKey: verdictResult.failure.messageKey },
          'update_recipe_moderation_upstream_error — recipe saved as pending',
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
    }

    const mergedMedia = input.media !== undefined
      ? input.media.map((m, i) => ({ id: randomUUID(), type: m.type, url: m.url, position: i }))
      : raw.media;

    const mergedProps = {
      id: raw.id,
      ownerId: raw.ownerId,
      createdAt: raw.createdAt,
      updatedAt: new Date(),
      name: mergedName,
      cuisine: input.cuisine !== undefined ? input.cuisine : raw.cuisine,
      difficulty: input.difficulty !== undefined ? input.difficulty : raw.difficulty,
      ingredients: mergedIngredients,
      instructions: mergedInstructions,
      prepTimeMinutes: input.prepTimeMinutes !== undefined ? input.prepTimeMinutes : raw.prepTimeMinutes,
      cookTimeMinutes: input.cookTimeMinutes !== undefined ? input.cookTimeMinutes : raw.cookTimeMinutes,
      servings: input.servings !== undefined ? input.servings : raw.servings,
      caloriesPerServing: input.caloriesPerServing !== undefined ? input.caloriesPerServing : raw.caloriesPerServing,
      image: input.image !== undefined ? input.image : raw.image,
      rating: input.rating !== undefined ? input.rating : raw.rating,
      tags: input.tags !== undefined ? input.tags : raw.tags,
      mealType: input.mealType !== undefined ? input.mealType : raw.mealType,
      media: mergedMedia,
      isPublished,
      moderationStatus,
      ...(input.nutrition !== undefined ? { nutrition: input.nutrition } : raw.nutrition !== undefined ? { nutrition: raw.nutrition } : {}),
    };

    const recipeResult = Recipe.create(mergedProps);
    if (!recipeResult.ok) return recipeResult;

    const persisted = await this.repo.update(recipeResult.value);
    if (!persisted.ok) return persisted;

    return ok(RecipeMapper.toDto(persisted.value, locale));
  }
}
