import type { Request, Response } from 'express';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import type {
  CreateRecipeUseCase,
  CreateRecipeInput,
} from '@application/recipes/use-cases/create-recipe-use-case';
import {
  ListRecipesQuerySchema,
  RecipeIdParamSchema,
  CreateRecipeBodySchema,
} from '@presentation/validators/recipes.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { UnauthorizedFailure } from '@core/failure';

export class RecipesController {
  constructor(
    private readonly listRecipes: ListRecipesUseCase,
    private readonly getRecipe: GetRecipeUseCase,
    private readonly createRecipe: CreateRecipeUseCase,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = ListRecipesQuerySchema.parse(req.query);
    const input: Parameters<ListRecipesUseCase['execute']>[0] = {
      page: parsed.page,
      pageSize: parsed.pageSize,
      ...(parsed.search !== undefined ? { search: parsed.search } : {}),
      ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
    };
    const result = await this.listRecipes.execute(input);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = RecipeIdParamSchema.parse(req.params);
    const result = await this.getRecipe.execute(id);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      const { status, body } = failureToHttp(new UnauthorizedFailure('Authentication required'));
      res.status(status).json(body);
      return;
    }

    const parsed = CreateRecipeBodySchema.parse(req.body);
    const input: CreateRecipeInput = {
      ownerId: req.user.id,
      name: parsed.name,
      cuisine: parsed.cuisine,
      difficulty: parsed.difficulty,
      ingredients: parsed.ingredients,
      instructions: parsed.instructions,
      prepTimeMinutes: parsed.prepTimeMinutes,
      cookTimeMinutes: parsed.cookTimeMinutes,
      image: parsed.image,
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
      ...(parsed.tags !== undefined ? { tags: parsed.tags } : {}),
      ...(parsed.mealType !== undefined ? { mealType: parsed.mealType } : {}),
      ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
      ...(parsed.isPublished !== undefined ? { isPublished: parsed.isPublished } : {}),
    };

    const result = await this.createRecipe.execute(input);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure);
      res.status(status).json(body);
      return;
    }
    res.status(201).json(result.value);
  };
}
