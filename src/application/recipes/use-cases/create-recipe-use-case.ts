import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/recipe-media';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

export interface CreateRecipeMediaInput {
  readonly type: MediaType;
  readonly url: string;
}

export interface CreateRecipeInput {
  readonly ownerId: string;
  readonly name: Record<string, string>;
  readonly cuisine: Record<string, string>;
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
  readonly isPublished?: boolean;
  readonly locale?: string;
}

export class CreateRecipeUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(input: CreateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const locale = input.locale ?? 'en';
    const now = new Date();
    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: input.name,
      cuisine: input.cuisine,
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
      isPublished: input.isPublished ?? true,
      createdAt: now,
      updatedAt: now,
    });
    if (!recipeResult.ok) return recipeResult;

    const persisted = await this.repo.create(recipeResult.value);
    if (!persisted.ok) return persisted;
    return ok(RecipeMapper.toDto(persisted.value, locale));
  }
}