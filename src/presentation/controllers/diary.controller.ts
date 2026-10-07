import type { Request, Response } from 'express';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import type { GetDiaryDayUseCase } from '@application/diary/use-cases/get-diary-day-use-case';
import type { GetDiaryMonthUseCase } from '@application/diary/use-cases/get-diary-month-use-case';
import type { ListRecentFoodsUseCase } from '@application/diary/use-cases/list-recent-foods-use-case';
import type { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import type { UpdateFoodLogEntryUseCase } from '@application/diary/use-cases/update-food-log-entry-use-case';
import type { DeleteFoodLogEntryUseCase } from '@application/diary/use-cases/delete-food-log-entry-use-case';
import type { SetDayWaterUseCase } from '@application/diary/use-cases/set-day-water-use-case';
import type { GetNutritionGoalsUseCase } from '@application/diary/use-cases/get-nutrition-goals-use-case';
import type { SetNutritionGoalsUseCase } from '@application/diary/use-cases/set-nutrition-goals-use-case';
import type { SearchDiaryFoodsUseCase } from '@application/diary/use-cases/search-diary-foods-use-case';
import type { ListRecentFoodsPageUseCase } from '@application/diary/use-cases/list-recent-foods-page-use-case';
import type { ListFoodProductsUseCase } from '@application/foods/use-cases/list-food-products-use-case';
import type { GetFoodProductUseCase } from '@application/foods/use-cases/get-food-product-use-case';
import type { GetBrandedProductUseCase } from '@application/foods/use-cases/get-branded-product-use-case';
import type { ListFoodCategoriesUseCase } from '@application/foods/use-cases/list-food-categories-use-case';
import type { ParseMealUseCase } from '@application/diary/use-cases/parse-meal-use-case';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';
import {
  CreateFoodLogEntryBodySchema,
  DiaryDateParamSchema,
  BarcodeParamSchema,
  DiaryFoodSearchQuerySchema,
  FoodIdParamSchema,
  FoodProductsQuerySchema,
  DiaryEntryIdParamSchema,
  DiaryMonthParamSchema,
  NutritionGoalsBodySchema,
  RecentFoodsQuerySchema,
  SetDayWaterBodySchema,
  UpdateFoodLogEntryBodySchema,
  MealParseBodySchema,
} from '@presentation/validators/diary.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface DiaryUseCases {
  readonly getDay: GetDiaryDayUseCase;
  readonly getMonth: GetDiaryMonthUseCase;
  readonly listRecent: ListRecentFoodsUseCase;
  readonly addEntry: AddFoodLogEntryUseCase;
  readonly updateEntry: UpdateFoodLogEntryUseCase;
  readonly deleteEntry: DeleteFoodLogEntryUseCase;
  readonly setWater: SetDayWaterUseCase;
  readonly getGoals: GetNutritionGoalsUseCase;
  readonly setGoals: SetNutritionGoalsUseCase;
  readonly searchFoods: SearchDiaryFoodsUseCase;
  readonly listRecentPage: ListRecentFoodsPageUseCase;
  readonly listProducts: ListFoodProductsUseCase;
  readonly getProduct: GetFoodProductUseCase;
  readonly getBrandedProduct: GetBrandedProductUseCase;
  readonly listCategories: ListFoodCategoriesUseCase;
  readonly parseMeal: ParseMealUseCase;
}

/** The food diary — every route is the signed-in user's own diary, nobody else's. */
export class DiaryController {
  constructor(
    private readonly uc: DiaryUseCases,
    private readonly ts: TranslationService,
  ) {}

  getDay = async (req: Request, res: Response): Promise<void> => {
    const { date } = DiaryDateParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.getDay.execute({ userId: requireUser(req).id, date }), OK);
  };

  getMonth = async (req: Request, res: Response): Promise<void> => {
    const { month } = DiaryMonthParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.getMonth.execute({ userId: requireUser(req).id, month }), OK);
  };

  listRecent = async (req: Request, res: Response): Promise<void> => {
    const { limit } = RecentFoodsQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.listRecent.execute({ userId: requireUser(req).id, limit }), OK);
  };

  addEntry = async (req: Request, res: Response): Promise<void> => {
    const body = CreateFoodLogEntryBodySchema.parse(req.body);
    const result = await this.uc.addEntry.execute({
      userId: requireUser(req).id,
      date: body.date,
      meal: body.meal,
      name: body.name,
      servings: body.servings,
      nutrients: {
        calories: body.calories,
        protein: body.protein ?? null,
        carbs: body.carbs ?? null,
        fat: body.fat ?? null,
        fiber: body.fiber ?? null,
      },
      recipeId: body.recipeId ?? null,
      product:
        body.product === undefined || body.product === null
          ? null
          : {
              source: body.product.source,
              foodVariantId: body.product.foodVariantId ?? null,
              offBarcode: body.product.offBarcode ?? null,
              unitKey: body.product.unitKey,
              unitAmount: body.product.unitAmount,
            },
    });
    this.reply(req, res, result, CREATED);
  };

  searchFoods = async (req: Request, res: Response): Promise<void> => {
    const { q, group, page, pageSize } = DiaryFoodSearchQuerySchema.parse(req.query);
    const result = await this.uc.searchFoods.execute({
      userId: requireUser(req).id,
      q,
      locale: req.locale ?? 'en',
      ...(group !== undefined ? { group } : {}),
      page,
      pageSize,
    });
    this.reply(req, res, result, OK);
  };

  listRecentPage = async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.listRecentPage.execute({ userId: requireUser(req).id, page, pageSize }), OK);
  };

  listProducts = async (req: Request, res: Response): Promise<void> => {
    const { q, category, page, pageSize } = FoodProductsQuerySchema.parse(req.query);
    const result = await this.uc.listProducts.execute({
      ...(q !== undefined ? { q } : {}),
      ...(category !== undefined ? { category } : {}),
      locale: req.locale ?? 'en',
      page,
      pageSize,
    });
    this.reply(req, res, result, OK);
  };

  getProduct = async (req: Request, res: Response): Promise<void> => {
    const { id } = FoodIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.getProduct.execute({ foodId: id, locale: req.locale ?? 'en' }), OK);
  };

  getBrandedProduct = async (req: Request, res: Response): Promise<void> => {
    const { barcode } = BarcodeParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.getBrandedProduct.execute({ barcode, locale: req.locale ?? 'en' }), OK);
  };

  /** `POST /diary/meal-parse` — JSON `{ text, locale? }`, or multipart with a `photo` file. Writes nothing. */
  parseMeal = async (req: Request, res: Response): Promise<void> => {
    const body = MealParseBodySchema.parse(req.body ?? {});
    const file = req.file;
    const result = await this.uc.parseMeal.execute({
      userId: requireUser(req).id,
      locale: body.locale ?? req.locale ?? 'en',
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(file !== undefined ? { photo: { bytes: file.buffer, mimeType: file.mimetype } } : {}),
    });
    this.reply(req, res, result, OK);
  };

  listCategories = async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.listCategories.execute({ locale: req.locale ?? 'en', page, pageSize }), OK);
  };

  updateEntry = async (req: Request, res: Response): Promise<void> => {
    const { id } = DiaryEntryIdParamSchema.parse(req.params);
    const body = UpdateFoodLogEntryBodySchema.parse(req.body);
    const result = await this.uc.updateEntry.execute({
      id,
      userId: requireUser(req).id,
      ...(body.meal !== undefined ? { meal: body.meal } : {}),
      ...(body.servings !== undefined ? { servings: body.servings } : {}),
      ...(body.date !== undefined ? { date: body.date } : {}),
    });
    this.reply(req, res, result, OK);
  };

  deleteEntry = async (req: Request, res: Response): Promise<void> => {
    const { id } = DiaryEntryIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.deleteEntry.execute({ id, userId: requireUser(req).id }), NO_CONTENT);
  };

  setWater = async (req: Request, res: Response): Promise<void> => {
    const { date } = DiaryDateParamSchema.parse(req.params);
    const { glasses } = SetDayWaterBodySchema.parse(req.body);
    this.reply(req, res, await this.uc.setWater.execute({ userId: requireUser(req).id, date, glasses }), OK);
  };

  getGoals = async (req: Request, res: Response): Promise<void> => {
    this.reply(req, res, await this.uc.getGoals.execute(requireUser(req).id), OK);
  };

  setGoals = async (req: Request, res: Response): Promise<void> => {
    const goals = NutritionGoalsBodySchema.parse(req.body);
    this.reply(req, res, await this.uc.setGoals.execute({ userId: requireUser(req).id, goals }), OK);
  };

  private reply<T>(req: Request, res: Response, result: Result<T, Failure>, status: number): void {
    if (!result.ok) {
      const locale = req.locale ?? 'en';
      const { status: failed, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(failed).json(body);
      return;
    }
    if (status === NO_CONTENT) {
      res.status(status).send();
      return;
    }
    res.status(status).json(result.value);
  }
}
