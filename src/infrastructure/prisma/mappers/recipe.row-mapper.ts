import type { Recipe as RecipeRow, RecipeMedia as RecipeMediaRow } from '@prisma/client';
import { isFail, type Result } from '@core/result/result';
import { UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { isDifficulty, type Difficulty } from '@domain/recipes/difficulty';
import { isModerationStatus, type ModerationStatus } from '@domain/recipes/moderation-status';
import { isMediaType, type RecipeMedia } from '@domain/recipes/recipe-media';
import { isRecipeCategory } from '@domain/recipes/recipe-category';
import { isCuisineKey } from '@domain/recipes/cuisine-key';
import { logger } from '@presentation/server/logger';

export type RecipeRowWithMedia = RecipeRow & { media?: RecipeMediaRow[]; commentCount?: number };

export class RecipeRowMapper {
  static toDomain(row: RecipeRowWithMedia): Result<Recipe, Failure> {
    const difficulty: Difficulty = isDifficulty(row.difficulty) ? row.difficulty : 'EASY';
    const rawModerationStatus = (row as { moderationStatus?: unknown }).moderationStatus;
    const moderationStatus: ModerationStatus = isModerationStatus(rawModerationStatus) ? rawModerationStatus : 'approved';
    const media: RecipeMedia[] = (row.media ?? [])
      .filter(m => isMediaType(m.type))
      .map(m => ({ id: m.id, type: m.type as 'image' | 'video', url: m.url, position: m.position }));

    // Validate enum columns that came from the DB — corrupted rows return a failure
    // instead of silently coercing to a default and hiding data issues.
    if (!isRecipeCategory(row.category)) {
      logger.error({ rowId: row.id, category: row.category }, 'RecipeRowMapper: invalid category on DB row');
      return { ok: false, failure: new ValidationFailure(`Invalid category value '${String(row.category)}' on recipe row ${row.id}`, 'category') };
    }
    if (!isCuisineKey(row.cuisine)) {
      logger.error({ rowId: row.id, cuisine: row.cuisine }, 'RecipeRowMapper: invalid cuisine on DB row');
      return { ok: false, failure: new ValidationFailure(`Invalid cuisine value '${String(row.cuisine)}' on recipe row ${row.id}`, 'cuisine') };
    }

    const result = Recipe.create({
      id: row.id,
      name: row.name as unknown as Record<string, string>,
      cuisine: row.cuisine,
      category: row.category,
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
      ...(row.nutrition != null ? { nutrition: row.nutrition as { protein?: number; carbs?: number; fat?: number; fiber?: number } } : {}),
      isPublished: row.isPublished,
      moderationStatus,
      viewCount: row.viewCount ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    if (isFail(result)) {
      logger.error({ rowId: row.id, validationFailure: result.failure }, 'RecipeRowMapper: domain entity creation failed on DB row');
      return { ok: false, failure: new UnknownFailure(`Corrupt recipe row ${row.id}`) };
    }
    return result;
  }
}
