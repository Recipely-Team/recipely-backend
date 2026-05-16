import type { Recipe } from '@domain/recipes/recipe';
import type { PageResult } from '@domain/recipes/recipe-query';
import type { PagedRecipesDto, RecipeDto } from '@application/recipes/dtos/recipe.dto';

export class RecipeMapper {
  static toDto(recipe: Recipe, locale: string): RecipeDto {
    const loc = recipe.localize(locale);
    return {
      id: recipe.id,
      name: loc.name,
      cuisine: loc.cuisine,
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
      moderationStatus: loc.moderationStatus,
      createdAt: loc.createdAt.toISOString(),
      updatedAt: loc.updatedAt.toISOString(),
    };
  }

  static toPagedDto(page: PageResult<Recipe>, locale: string): PagedRecipesDto {
    return {
      items: page.items.map(r => RecipeMapper.toDto(r, locale)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }
}