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
import { UnauthorizedFailure, UnprocessableFailure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';

export class RecipesController {
  constructor(
    private readonly listRecipes: ListRecipesUseCase,
    private readonly getRecipe: GetRecipeUseCase,
    private readonly createRecipe: CreateRecipeUseCase,
    private readonly ts: TranslationService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = ListRecipesQuerySchema.parse(req.query);
    const locale = req.locale ?? 'en';
    const input: Parameters<ListRecipesUseCase['execute']>[0] = {
      page: parsed.page,
      pageSize: parsed.pageSize,
      locale,
      ...(parsed.search !== undefined ? { search: parsed.search } : {}),
      ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
      ...(parsed.cuisines !== undefined ? { cuisines: parsed.cuisines } : {}),
      ...(parsed.difficulties !== undefined ? { difficulties: parsed.difficulties } : {}),
      ...(parsed.maxTime !== undefined ? { maxTime: parsed.maxTime } : {}),
      ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
    };
    const result = await this.listRecipes.execute(input);
    if (!result.ok) {
      const { status, body } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = RecipeIdParamSchema.parse(req.params);
    const locale = req.locale ?? 'en';
    const result = await this.getRecipe.execute(id, locale);
    if (!result.ok) {
      const { status, body } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  // Handles POST /with-image: image comes from req.file (processed by Sharp middleware),
  // its public URL is in res.locals.imageUrl, and all other fields are FormData strings.
  createWithImage = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      const locale = req.locale ?? 'en';
      const { status, body } = failureToHttp(
        new UnauthorizedFailure('errors.unauthorized.missing_token'),
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }

    if (!req.file) {
      const { status, body } = failureToHttp(
        new UnprocessableFailure('errors.validation.image_required', 'image'),
      );
      res.status(status).json(body);
      return;
    }

    const locale = req.locale ?? 'en';
    const raw = req.body as Record<string, string | undefined>;

    const REQUIRED_FIELDS = [
      'name', 'cuisine', 'difficulty', 'ingredients', 'instructions',
      'prepTimeMinutes', 'cookTimeMinutes',
    ] as const;
    // Explicit null/empty-string check: !raw[f] would incorrectly reject the
    // string '0' (a valid zero value for prepTimeMinutes / cookTimeMinutes).
    const firstMissing = REQUIRED_FIELDS.find(f => raw[f] == null || raw[f] === '');
    if (firstMissing) {
      const { status, body } = failureToHttp(
        new UnprocessableFailure('errors.validation.missing_field', firstMissing),
      );
      res.status(status).json(body);
      return;
    }

    const imageUrl = typeof res.locals['imageUrl'] === 'string' ? res.locals['imageUrl'] : '';

    // JSON.parse throws SyntaxError on bad input; the global error handler maps it to 400.
    const assembled = {
      name:             JSON.parse(raw['name'] as string) as unknown,
      cuisine:          JSON.parse(raw['cuisine'] as string) as unknown,
      difficulty:       raw['difficulty'],
      ingredients:      JSON.parse(raw['ingredients'] as string) as unknown,
      instructions:     JSON.parse(raw['instructions'] as string) as unknown,
      prepTimeMinutes:  parseInt(raw['prepTimeMinutes'] as string, 10),
      cookTimeMinutes:  parseInt(raw['cookTimeMinutes'] as string, 10),
      image:            imageUrl,
      ...(raw['servings'] !== undefined
        ? { servings: parseInt(raw['servings'], 10) } : {}),
      ...(raw['caloriesPerServing'] !== undefined
        ? { caloriesPerServing: parseInt(raw['caloriesPerServing'], 10) } : {}),
      ...(raw['rating'] !== undefined
        ? { rating: parseFloat(raw['rating']) } : {}),
      ...(raw['tags'] !== undefined
        ? { tags: JSON.parse(raw['tags']) as unknown } : {}),
      ...(raw['mealType'] !== undefined
        ? { mealType: JSON.parse(raw['mealType']) as unknown } : {}),
      ...(raw['categoryId'] !== undefined
        ? { categoryId: raw['categoryId'] } : {}),
      ...(raw['isPublished'] !== undefined
        ? { isPublished: raw['isPublished'] === 'true' } : {}),
    };

    const parsed = CreateRecipeBodySchema.parse(assembled);
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
      locale,
      ...(parsed.servings !== undefined ? { servings: parsed.servings } : {}),
      ...(parsed.caloriesPerServing !== undefined ? { caloriesPerServing: parsed.caloriesPerServing } : {}),
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
      ...(parsed.tags !== undefined ? { tags: parsed.tags } : {}),
      ...(parsed.mealType !== undefined ? { mealType: parsed.mealType } : {}),
      ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
      ...(parsed.isPublished !== undefined ? { isPublished: parsed.isPublished } : {}),
    };

    const result = await this.createRecipe.execute(input);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[createWithImage] execute failed:', result.failure.code, (result.failure as { message?: string }).message ?? result.failure);
      const { status, body } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    res.status(201).json(result.value);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      const locale = req.locale ?? 'en';
      const { status, body } = failureToHttp(
        new UnauthorizedFailure('errors.unauthorized.missing_token'),
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }

    const locale = req.locale ?? 'en';
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
      locale,
      ...(parsed.servings !== undefined ? { servings: parsed.servings } : {}),
      ...(parsed.caloriesPerServing !== undefined ? { caloriesPerServing: parsed.caloriesPerServing } : {}),
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
      ...(parsed.tags !== undefined ? { tags: parsed.tags } : {}),
      ...(parsed.mealType !== undefined ? { mealType: parsed.mealType } : {}),
      ...(parsed.media !== undefined ? { media: parsed.media } : {}),
      ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
      ...(parsed.isPublished !== undefined ? { isPublished: parsed.isPublished } : {}),
    };

    const result = await this.createRecipe.execute(input);
    if (!result.ok) {
      const { status, body } = failureToHttp(
        result.failure,
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    res.status(201).json(result.value);
  };
}