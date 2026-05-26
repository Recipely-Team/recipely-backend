import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/recipe-media';
import type { ModerationStatus } from '@domain/recipes/moderation-status';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { IRecipeModerator, ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';

export interface CreateRecipeMediaInput {
  readonly type: MediaType;
  readonly url: string;
}

export interface CreateRecipeInput {
  readonly ownerId: string;
  readonly name: Record<string, string>;
  readonly cuisine: CuisineKey;
  readonly category: RecipeCategory;
  readonly difficulty: Difficulty;
  readonly ingredients: Record<string, string[]>;
  readonly instructions: Record<string, string[]>;
  readonly prepTimeMinutes: number;
  readonly cookTimeMinutes: number;
  readonly servings?: number;
  readonly caloriesPerServing?: number;
  readonly image: string;
  readonly rating?: number;
  readonly tags?: Record<string, string[]>;
  readonly mealType?: Record<string, string[]>;
  readonly media?: CreateRecipeMediaInput[];
  readonly nutrition?: { protein?: number | undefined; carbs?: number | undefined; fat?: number | undefined; fiber?: number | undefined };
  readonly locale?: string;
}

export class CreateRecipeUseCase {
  constructor(
    private readonly repo: IRecipeRepository,
    private readonly moderator: IRecipeModerator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: CreateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const locale = input.locale ?? 'en';

    const moderateReq: ModerateRecipeRequest = {
      title: Object.values(input.name)[0] ?? '',
      ingredients: Object.values(input.ingredients)[0] ?? [],
      instructions: Object.values(input.instructions)[0] ?? [],
    };

    let moderationStatus: ModerationStatus;
    let isPublished: boolean;

    const verdictResult = await this.moderator.moderate(moderateReq);
    if (!verdictResult.ok) {
      this.logger.warn(
        { code: verdictResult.failure.code, messageKey: verdictResult.failure.messageKey },
        'create_recipe_moderation_upstream_error — recipe saved as pending',
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
    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: input.name,
      cuisine: input.cuisine,
      category: input.category,
      difficulty: input.difficulty,
      ingredients: input.ingredients,
      instructions: input.instructions,
      prepTimeMinutes: input.prepTimeMinutes,
      cookTimeMinutes: input.cookTimeMinutes,
      servings: input.servings ?? 1,
      caloriesPerServing: input.caloriesPerServing ?? 0,
      image: input.image,
      rating: input.rating ?? 0,
      tags: input.tags ?? { [locale]: [] },
      mealType: input.mealType ?? { [locale]: [] },
      media: (input.media ?? []).map((m, i) => ({
        id: randomUUID(),
        type: m.type,
        url: m.url,
        position: i,
      })),
      ownerId: input.ownerId,
      ...(input.nutrition !== undefined ? { nutrition: input.nutrition } : {}),
      isPublished,
      moderationStatus,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (!recipeResult.ok) return recipeResult;

    const persisted = await this.repo.create(recipeResult.value);
    if (!persisted.ok) return persisted;
    return ok(RecipeMapper.toDto(persisted.value, locale));
  }
}
