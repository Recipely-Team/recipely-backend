import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult } from '@domain/recipes/query/recipe-page-result';
import type { RecipeSocialData } from '@domain/recipes/query/recipe-social-data';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { PagedRecipeListDto } from '@application/recipes/dtos/paged-recipe-list.dto';
import type { PagedRecipesDto } from '@application/recipes/dtos/paged-recipes.dto';
import type { RecipeListItemDto } from '@application/recipes/dtos/recipe-list-item.dto';

export class RecipeMapper {
  /** `viewerId` decides the owner-only fields: `publishBlockers` is sent only to the owner. */
  static toDto(recipe: Recipe, locale: string, social?: RecipeSocialData, viewerId?: string): RecipeDto {
    const loc = recipe.localize(locale);
    return {
      id: recipe.id,
      name: loc.name,
      cuisine: loc.cuisine,
      category: loc.category,
      difficulty: loc.difficulty,
      ingredients: loc.ingredients,
      instructions: loc.instructions,
      prepTimeMinutes: loc.prepTimeMinutes,
      cookTimeMinutes: loc.cookTimeMinutes,
      servings: loc.servings,
      caloriesPerServing: loc.caloriesPerServing,
      image: loc.image,
      rating: loc.rating,
      tags: loc.tags,
      mealType: loc.mealType,
      media: loc.media.map(m => ({ id: m.id, type: m.type, url: m.url, position: m.position })),
      ownerId: loc.ownerId,
      ...(loc.nutrition !== undefined ? { nutrition: loc.nutrition } : {}),
      ...(loc.tips !== undefined ? { tips: loc.tips } : {}),
      moderationStatus: loc.moderationStatus,
      isPublished: loc.isPublished,
      likeCount: social?.likeCount ?? 0,
      likedByMe: social?.likedByMe ?? false,
      commentCount: social?.commentCount ?? 0,
      viewCount: loc.viewCount,
      origin: loc.origin,
      ...(loc.sourceUrl !== undefined ? { sourceUrl: loc.sourceUrl } : {}),
      ...(loc.sourceHandle !== undefined ? { sourceHandle: loc.sourceHandle } : {}),
      ...(viewerId !== undefined && viewerId === recipe.ownerId ? { publishBlockers: recipe.publishBlockers() } : {}),
      createdAt: loc.createdAt.toISOString(),
      updatedAt: loc.updatedAt.toISOString(),
    };
  }

  static toPagedDto(page: RecipePageResult, locale: string): PagedRecipesDto {
    return {
      items: page.items.map(r =>
        RecipeMapper.toDto(r, locale, page.socialByRecipeId.get(r.id)),
      ),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  static toListItemDto(recipe: Recipe, locale: string, social?: RecipeSocialData): RecipeListItemDto {
    const loc = recipe.localize(locale);
    return {
      id: recipe.id,
      name: loc.name,
      image: loc.image,
      cuisine: loc.cuisine,
      category: loc.category,
      difficulty: loc.difficulty,
      totalTimeMinutes: loc.prepTimeMinutes + loc.cookTimeMinutes,
      rating: loc.rating,
      moderationStatus: loc.moderationStatus,
      isPublished: loc.isPublished,
      likeCount: social?.likeCount ?? 0,
      likedByMe: social?.likedByMe ?? false,
      commentCount: social?.commentCount ?? 0,
      viewCount: loc.viewCount,
      origin: loc.origin,
    };
  }

  static toPagedListDto(page: RecipePageResult, locale: string): PagedRecipeListDto {
    return {
      items: page.items.map(r =>
        RecipeMapper.toListItemDto(r, locale, page.socialByRecipeId.get(r.id)),
      ),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }
}
