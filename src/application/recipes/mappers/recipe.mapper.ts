import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeSocialData } from '@domain/recipes/recipe-query';
import type { PagedRecipesDto, RecipeDto } from '@application/recipes/dtos/recipe.dto';

export class RecipeMapper {
  static toDto(recipe: Recipe, locale: string, social?: RecipeSocialData): RecipeDto {
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
      likeCount: social?.likeCount ?? 0,
      likedByMe: social?.likedByMe ?? false,
      commentCount: social?.commentCount ?? 0,
      viewCount: loc.viewCount,
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
}
