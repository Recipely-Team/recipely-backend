import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

export interface CreateRecipeInput {
  readonly ownerId: string;
  readonly name: string;
  readonly cuisine: string;
  readonly difficulty: Difficulty;
  readonly ingredients: string[];
  readonly instructions: string[];
  readonly prepTimeMinutes: number;
  readonly cookTimeMinutes: number;
  readonly image: string;
  readonly rating?: number;
  readonly tags?: string[];
  readonly mealType?: string[];
  readonly categoryId?: string | null;
  readonly isPublished?: boolean;
}

export class CreateRecipeUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(input: CreateRecipeInput): Promise<Result<RecipeDto, Failure>> {
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
      image: input.image,
      rating: input.rating ?? 0,
      tags: input.tags ?? [],
      mealType: input.mealType ?? [],
      ownerId: input.ownerId,
      categoryId: input.categoryId ?? null,
      isPublished: input.isPublished ?? true,
      createdAt: now,
      updatedAt: now,
    });
    if (!recipeResult.ok) return recipeResult;

    const persisted = await this.repo.create(recipeResult.value);
    if (!persisted.ok) return persisted;
    return ok(RecipeMapper.toDto(persisted.value));
  }
}
