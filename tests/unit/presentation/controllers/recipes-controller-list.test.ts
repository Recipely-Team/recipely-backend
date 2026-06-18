import type { Request, Response } from 'express';
import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import type { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import type { UpdateRecipeUseCase } from '@application/recipes/use-cases/update-recipe-use-case';
import type { DeleteRecipeUseCase } from '@application/recipes/use-cases/delete-recipe-use-case';
import type { GenerateRecipeUseCase } from '@application/ai/use-cases/generate-recipe-use-case';
import type { CalculateRecipeNutritionUseCase } from '@application/recipes/use-cases/calculate-recipe-nutrition-use-case';
import type { BackfillRecipeNutritionUseCase } from '@application/recipes/use-cases/backfill-recipe-nutrition-use-case';
import type { IncrementViewCountUseCase } from '@application/recipes/use-cases/increment-view-count-use-case';
import type { ImportInstagramRecipeUseCase } from '@application/ai/use-cases/import-instagram-recipe-use-case';
import type { ListTrendingRecipesUseCase } from '@application/recipes/use-cases/list-trending-recipes-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import type { PagedRecipesDto } from '@application/recipes/dtos/recipe.dto';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { RECIPE_CATEGORY_VALUES } from '@domain/recipes/recipe-category';
import { CUISINE_KEY_VALUES } from '@domain/recipes/cuisine-key';

// ---- helpers ----------------------------------------------------------------

function makeTranslationService(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  };
}

function makeListUseCase(
  result: Result<PagedRecipesDto, Failure> = ok({ items: [], total: 0, page: 1, pageSize: 20 }),
): ListRecipesUseCase {
  return {
    execute: jest.fn<Promise<Result<PagedRecipesDto, Failure>>, [unknown]>().mockResolvedValue(result),
  } as unknown as ListRecipesUseCase;
}

function makeController(listUseCase: ListRecipesUseCase): RecipesController {
  return new RecipesController(
    listUseCase,
    {} as GetRecipeUseCase,
    {} as CreateRecipeUseCase,
    {} as GenerateRecipeUseCase,
    makeTranslationService(),
    {} as UpdateRecipeUseCase,
    {} as DeleteRecipeUseCase,
    {} as CalculateRecipeNutritionUseCase,
    {} as BackfillRecipeNutritionUseCase,
    {} as IncrementViewCountUseCase,
    {} as ImportInstagramRecipeUseCase,
    {} as ListTrendingRecipesUseCase,
  );
}

function makeReq(query: Record<string, unknown> = {}, user?: { id: string; email: string }): Request {
  return {
    query,
    body: {},
    params: {},
    user,
    locale: 'en',
  } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock; send: jest.Mock } {
  const json = jest.fn();
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ json, send });
  const res = { status, json, send } as unknown as Response;
  return { res, status, json, send };
}

// ---- tests: list — likedOnly without auth -----------------------------------

describe('RecipesController.list — likedOnly auth short-circuit', () => {
  it('responds with 401 when likedOnly=true and req.user is undefined', async () => {
    const listUseCase = makeListUseCase();
    const controller = makeController(listUseCase);
    const req = makeReq({ likedOnly: 'true' });
    const { res, status } = makeRes();

    await controller.list(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });

  it('responds with unauthorized code when likedOnly=true and no auth', async () => {
    const listUseCase = makeListUseCase();
    const controller = makeController(listUseCase);
    const req = makeReq({ likedOnly: 'true' });
    const { res, status } = makeRes();
    const statusReturn = { json: jest.fn() };
    (status as jest.Mock).mockReturnValue(statusReturn);

    await controller.list(req, res);

    expect(statusReturn.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'unauthorized' }),
      }),
    );
  });

  it('does not call listRecipes.execute when likedOnly short-circuit fires', async () => {
    const listUseCase = makeListUseCase();
    const controller = makeController(listUseCase);
    const req = makeReq({ likedOnly: 'true' });
    const { res } = makeRes();

    await controller.list(req, res);

    expect(listUseCase.execute).not.toHaveBeenCalled();
  });

  it('proceeds to use case when likedOnly=true and user is authenticated', async () => {
    const listUseCase = makeListUseCase();
    const controller = makeController(listUseCase);
    const req = makeReq({ likedOnly: 'true' }, { id: 'user-1', email: 'u@example.com' });
    const { res } = makeRes();

    await controller.list(req, res);

    expect(listUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('responds with 200 when likedOnly=true and user is authenticated', async () => {
    const listUseCase = makeListUseCase();
    const controller = makeController(listUseCase);
    const req = makeReq({ likedOnly: 'true' }, { id: 'user-1', email: 'u@example.com' });
    const { res, status } = makeRes();

    await controller.list(req, res);

    expect(status).toHaveBeenCalledWith(200);
  });
});

// ---- tests: list — use case failure mapping ---------------------------------

describe('RecipesController.list — use case failure HTTP mapping', () => {
  it('responds with 500 when use case returns an UnknownFailure', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const listUseCase = makeListUseCase(fail(repoFailure));
    const controller = makeController(listUseCase);
    const req = makeReq();
    const { res, status } = makeRes();

    await controller.list(req, res);

    expect(status).toHaveBeenCalledWith(500);
  });
});

// ---- tests: getCategories ---------------------------------------------------

describe('RecipesController.getCategories', () => {
  it('responds with 200', () => {
    const controller = makeController(makeListUseCase());
    const req = makeReq();
    const statusMock = jest.fn();
    const json = jest.fn();
    statusMock.mockReturnValue({ json });
    const res = { status: statusMock } as unknown as Response;

    controller.getCategories(req, res);

    expect(statusMock).toHaveBeenCalledWith(200);
  });

  it('responds with the full RECIPE_CATEGORY_VALUES array', () => {
    const controller = makeController(makeListUseCase());
    const req = makeReq();
    const json = jest.fn();
    const statusReturn = { json };
    const res = { status: jest.fn().mockReturnValue(statusReturn) } as unknown as Response;

    controller.getCategories(req, res);

    // The endpoint returns localized catalog items ({ key, name, emoji }); the
    // set of `key`s must equal the full enum value list.
    const call = statusReturn.json.mock.calls[0]?.[0] as { categories: { key: string }[] };
    expect(call.categories.map(c => c.key)).toEqual([...RECIPE_CATEGORY_VALUES]);
  });

  it('returns all 11 category values', () => {
    const controller = makeController(makeListUseCase());
    const req = makeReq();
    const json = jest.fn();
    const statusReturn = { json };
    const res = { status: jest.fn().mockReturnValue(statusReturn) } as unknown as Response;

    controller.getCategories(req, res);

    const call = statusReturn.json.mock.calls[0]?.[0] as { categories: unknown[] } | undefined;
    expect(call?.categories).toHaveLength(RECIPE_CATEGORY_VALUES.length);
  });
});

// ---- tests: getCuisines -----------------------------------------------------

describe('RecipesController.getCuisines', () => {
  it('responds with 200', () => {
    const controller = makeController(makeListUseCase());
    const req = makeReq();
    const statusMock = jest.fn();
    const json = jest.fn();
    statusMock.mockReturnValue({ json });
    const res = { status: statusMock } as unknown as Response;

    controller.getCuisines(req, res);

    expect(statusMock).toHaveBeenCalledWith(200);
  });

  it('responds with the full CUISINE_KEY_VALUES array', () => {
    const controller = makeController(makeListUseCase());
    const req = makeReq();
    const json = jest.fn();
    const statusReturn = { json };
    const res = { status: jest.fn().mockReturnValue(statusReturn) } as unknown as Response;

    controller.getCuisines(req, res);

    // The endpoint returns localized catalog items ({ key, name, emoji }); the
    // set of `key`s must equal the full enum value list.
    const call = statusReturn.json.mock.calls[0]?.[0] as { cuisines: { key: string }[] };
    expect(call.cuisines.map(c => c.key)).toEqual([...CUISINE_KEY_VALUES]);
  });

  it('returns all 15 cuisine values', () => {
    const controller = makeController(makeListUseCase());
    const req = makeReq();
    const json = jest.fn();
    const statusReturn = { json };
    const res = { status: jest.fn().mockReturnValue(statusReturn) } as unknown as Response;

    controller.getCuisines(req, res);

    const call = statusReturn.json.mock.calls[0]?.[0] as { cuisines: unknown[] } | undefined;
    expect(call?.cuisines).toHaveLength(CUISINE_KEY_VALUES.length);
  });
});
