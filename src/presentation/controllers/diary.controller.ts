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
import {
  CreateFoodLogEntryBodySchema,
  DiaryDateParamSchema,
  DiaryEntryIdParamSchema,
  DiaryMonthParamSchema,
  NutritionGoalsBodySchema,
  RecentFoodsQuerySchema,
  SetDayWaterBodySchema,
  UpdateFoodLogEntryBodySchema,
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
    });
    this.reply(req, res, result, CREATED);
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
