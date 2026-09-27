import type { Recipe as RecipeRow, RecipeMedia as RecipeMediaRow } from '@prisma/client';
import { isFail, type Result } from '@core/result/result';
import { UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import { isDifficulty, type Difficulty } from '@domain/recipes/difficulty';
import { isModerationStatus, ModerationStatus } from '@domain/moderation/moderation-status';
import { type RecipeMedia } from '@domain/recipes/recipe-media';
import { isMediaType } from '@domain/recipes/media-type';
import { focalPointFromColumns } from '@infrastructure/prisma/mappers/focal-point-from-columns';
import { isRecipeCategory } from '@domain/recipes/recipe-category';
import { isCuisineKey } from '@domain/recipes/cuisine-key';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';
import { RecipeOrigin, type RecipeOriginType } from '@domain/recipes/recipe-origin';
import { toSourcePlatform } from '@domain/recipes/to-source-platform';

export type RecipeRowWithMedia = RecipeRow & { media?: RecipeMediaRow[]; commentCount?: number };

export class RecipeRowMapper {
  static toDomain(row: RecipeRowWithMedia): Result<Recipe, Failure> {
    const difficulty: Difficulty = isDifficulty(row.difficulty) ? row.difficulty : 'EASY';
    const rawModerationStatus = (row as { moderationStatus?: unknown }).moderationStatus;
    const moderationStatus: ModerationStatus = isModerationStatus(rawModerationStatus) ? rawModerationStatus : ModerationStatus.Approved;
    const media: RecipeMedia[] = (row.media ?? [])
      .filter(m => isMediaType(m.type))
      .map(m => {
        const focus = focalPointFromColumns(m.focusX, m.focusY);
        return {
          id: m.id,
          type: m.type as 'image' | 'video',
          url: m.url,
          position: m.position,
          ...(focus !== undefined ? { focus } : {}),
        };
      });
    const imageFocus = focalPointFromColumns(row.imageFocusX, row.imageFocusY);

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
      ...(imageFocus !== undefined ? { imageFocus } : {}),
      rating: row.rating,
      tags: row.tags as unknown as Record<string, string[]>,
      mealType: row.mealType as unknown as Record<string, string[]>,
      media,
      ownerId: row.ownerId,
      ...(row.nutrition != null ? { nutrition: row.nutrition as RecipeNutrition } : {}),
      ...(() => { const tips = row.tips as Record<string, string[]> | null | undefined; return tips !== null && tips !== undefined ? { tips } : {}; })(),
      isPublished: row.isPublished,
      moderationStatus,
      viewCount: row.viewCount ?? 0,
      // A row written before the column existed reads as USER, which is what
      // the migration's default says about it too.
      origin: (row.origin as RecipeOriginType | undefined) ?? RecipeOrigin.User,
      ...(row.sourceUrl != null ? { sourceUrl: row.sourceUrl } : {}),
      ...(row.sourceHandle != null ? { sourceHandle: row.sourceHandle } : {}),
      // `toSourcePlatform` rather than a cast: a row written by a newer server
      // that knows a third platform reads as "imported, from somewhere this
      // build cannot name" instead of making the client draw a mark it has no
      // word for.
      sourcePlatform: toSourcePlatform(row.sourcePlatform as string | null | undefined),
      aiWritten: row.aiWritten ?? false,
      importedImage: row.importedImage ?? null,
      importedIngredientsHash: row.importedIngredientsHash ?? null,
      importedInstructionsHash: row.importedInstructionsHash ?? null,
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
