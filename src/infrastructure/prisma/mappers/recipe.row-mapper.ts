import type { Recipe as RecipeRow, RecipeMedia as RecipeMediaRow } from '@prisma/client';
import { isFail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { isDifficulty, type Difficulty } from '@domain/recipes/difficulty';
import { isMediaType, type RecipeMedia } from '@domain/recipes/recipe-media';

export type RecipeRowWithMedia = RecipeRow & { media?: RecipeMediaRow[] };

export class RecipeRowMapper {
  static toDomain(row: RecipeRowWithMedia): Result<Recipe, Failure> {
    const difficulty: Difficulty = isDifficulty(row.difficulty) ? row.difficulty : 'EASY';
    const media: RecipeMedia[] = (row.media ?? [])
      .filter(m => isMediaType(m.type))
      .map(m => ({ id: m.id, type: m.type as 'image' | 'video', url: m.url, position: m.position }));

    const result = Recipe.create({
      id: row.id,
      name: row.name as unknown as Record<string, string>,
      cuisine: row.cuisine as unknown as Record<string, string>,
      difficulty,
      ingredients: row.ingredients as unknown as Record<string, string[]>,
      instructions: row.instructions as unknown as Record<string, string[]>,
      prepTimeMinutes: row.prepTimeMinutes,
      cookTimeMinutes: row.cookTimeMinutes,
      servings: row.servings,
      caloriesPerServing: row.caloriesPerServing,
      image: row.image,
      rating: row.rating,
      tags: row.tags as unknown as Record<string, string[]>,
      mealType: row.mealType as unknown as Record<string, string[]>,
      media,
      ownerId: row.ownerId,
      categoryId: row.categoryId,
      isPublished: row.isPublished,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    if (isFail(result)) {
      return { ok: false, failure: new UnknownFailure(`Corrupt recipe row ${row.id}`) };
    }
    return result;
  }
}
