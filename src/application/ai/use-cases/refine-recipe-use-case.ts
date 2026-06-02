import { randomUUID } from 'crypto';
import { ok, fail, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { isCuisineKey, CuisineKey } from '@domain/recipes/cuisine-key';
import { isRecipeCategory, RecipeCategory } from '@domain/recipes/recipe-category';
import type { DraftRecipeSnapshot } from '@domain/drafts/recipe-draft';
import type { IRecipeRefiner } from '@application/ai/ports/i-recipe-refiner';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

export interface RefineRecipeInput {
  readonly ownerId: string;
  readonly currentRecipe: DraftRecipeSnapshot;
  readonly instruction: string;
  readonly locale: string;
}

export class RefineRecipeUseCase {
  constructor(private readonly refiner: IRecipeRefiner) {}

  async execute(input: RefineRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const trimmedInstruction = input.instruction.trim();
    if (trimmedInstruction.length === 0) {
      return fail(new UnprocessableFailure('errors.validation.prompt_required', 'instruction'));
    }

    const refined = await this.refiner.refine({
      currentRecipe: input.currentRecipe,
      instruction: trimmedInstruction,
      locale: input.locale,
    });

    if (!refined.ok) return refined;

    const { recipe: aiRecipe } = refined.value;

    const now = new Date();

    const cuisineRaw = aiRecipe.cuisine.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const cuisine = isCuisineKey(cuisineRaw) ? cuisineRaw : CuisineKey.Other;

    const categoryRaw = aiRecipe.category.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const category = isRecipeCategory(categoryRaw) ? categoryRaw : RecipeCategory.MainCourse;

    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: { [input.locale]: aiRecipe.title },
      cuisine,
      category,
      difficulty: aiRecipe.difficulty,
      ingredients: { [input.locale]: [...aiRecipe.ingredients] },
      instructions: { [input.locale]: [...aiRecipe.instructions] },
      prepTimeMinutes: aiRecipe.prepTimeMinutes,
      cookTimeMinutes: aiRecipe.cookTimeMinutes,
      servings: aiRecipe.servings,
      caloriesPerServing: aiRecipe.caloriesPerServing,
      image: '',
      rating: 0,
      tags: { [input.locale]: [...aiRecipe.tags] },
      mealType: { [input.locale]: [...aiRecipe.mealType] },
      media: [],
      ownerId: input.ownerId,
      nutrition: aiRecipe.nutrition,
      isPublished: false,
      moderationStatus: 'pending',
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (!recipeResult.ok) return recipeResult;

    return ok(RecipeMapper.toDto(recipeResult.value, input.locale));
  }
}
