import type { Request, Response } from 'express';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import type { GetMealPlanUseCase } from '@application/meal-plan/use-cases/get-meal-plan-use-case';
import type { AddMealPlanEntryUseCase } from '@application/meal-plan/use-cases/add-meal-plan-entry-use-case';
import type { UpdateMealPlanEntryUseCase } from '@application/meal-plan/use-cases/update-meal-plan-entry-use-case';
import type { DeleteMealPlanEntryUseCase } from '@application/meal-plan/use-cases/delete-meal-plan-entry-use-case';
import type { MarkMealPlanEntryEatenUseCase } from '@application/meal-plan/use-cases/mark-meal-plan-entry-eaten-use-case';
import type { UnmarkMealPlanEntryEatenUseCase } from '@application/meal-plan/use-cases/unmark-meal-plan-entry-eaten-use-case';
import type { CopyMealPlanWeekUseCase } from '@application/meal-plan/use-cases/copy-meal-plan-week-use-case';
import type { ClearMealPlanRangeUseCase } from '@application/meal-plan/use-cases/clear-meal-plan-range-use-case';
import type { ListMealPlanIngredientsUseCase } from '@application/meal-plan/use-cases/list-meal-plan-ingredients-use-case';
import type { SuggestMealPlanWeekUseCase } from '@application/meal-plan/use-cases/suggest-meal-plan-week-use-case';
import {
  AddMealPlanEntryBodySchema,
  CopyMealPlanBodySchema,
  MealPlanEntryIdParamSchema,
  MealPlanRangeQuerySchema,
  SuggestMealPlanWeekQuerySchema,
  UpdateMealPlanEntryBodySchema,
} from '@presentation/validators/meal-plan/meal-plan.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface MealPlanUseCases {
  readonly get: GetMealPlanUseCase;
  readonly add: AddMealPlanEntryUseCase;
  readonly update: UpdateMealPlanEntryUseCase;
  readonly remove: DeleteMealPlanEntryUseCase;
  readonly markEaten: MarkMealPlanEntryEatenUseCase;
  readonly unmarkEaten: UnmarkMealPlanEntryEatenUseCase;
  readonly copyWeek: CopyMealPlanWeekUseCase;
  readonly clearRange: ClearMealPlanRangeUseCase;
  readonly ingredients: ListMealPlanIngredientsUseCase;
  readonly suggest: SuggestMealPlanWeekUseCase;
}

/** The signed-in user's meal plan — nobody else's is reachable from here. */
export class MealPlanController {
  constructor(
    private readonly uc: MealPlanUseCases,
    private readonly ts: TranslationService,
  ) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = MealPlanRangeQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.get.execute({ userId: requireUser(req).id, from, to, locale: locale(req) }), OK);
  };

  suggest = async (req: Request, res: Response): Promise<void> => {
    const { weekStart, meals, seed } = SuggestMealPlanWeekQuerySchema.parse(req.query);
    const result = await this.uc.suggest.execute({
      userId: requireUser(req).id,
      weekStart,
      meals,
      seed: seed ?? Math.floor(Math.random() * 2_147_483_647),
      locale: locale(req),
    });
    this.reply(req, res, result, OK);
  };

  add = async (req: Request, res: Response): Promise<void> => {
    const body = AddMealPlanEntryBodySchema.parse(req.body);
    this.reply(req, res, await this.uc.add.execute({ userId: requireUser(req).id, locale: locale(req), ...body }), CREATED);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = MealPlanEntryIdParamSchema.parse(req.params);
    const body = UpdateMealPlanEntryBodySchema.parse(req.body);
    const result = await this.uc.update.execute({
      id,
      userId: requireUser(req).id,
      locale: locale(req),
      ...(body.date !== undefined ? { date: body.date } : {}),
      ...(body.meal !== undefined ? { meal: body.meal } : {}),
      ...(body.servings !== undefined ? { servings: body.servings } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
    });
    this.reply(req, res, result, OK);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = MealPlanEntryIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.remove.execute({ id, userId: requireUser(req).id }), NO_CONTENT);
  };

  markEaten = async (req: Request, res: Response): Promise<void> => {
    const { id } = MealPlanEntryIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.markEaten.execute({ id, userId: requireUser(req).id, locale: locale(req) }), OK);
  };

  unmarkEaten = async (req: Request, res: Response): Promise<void> => {
    const { id } = MealPlanEntryIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.unmarkEaten.execute({ id, userId: requireUser(req).id, locale: locale(req) }), OK);
  };

  copyWeek = async (req: Request, res: Response): Promise<void> => {
    const body = CopyMealPlanBodySchema.parse(req.body);
    this.reply(req, res, await this.uc.copyWeek.execute({ userId: requireUser(req).id, ...body }), OK);
  };

  clearRange = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = MealPlanRangeQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.clearRange.execute({ userId: requireUser(req).id, from, to }), NO_CONTENT);
  };

  ingredients = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = MealPlanRangeQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.ingredients.execute({ userId: requireUser(req).id, from, to, locale: locale(req) }), OK);
  };

  private reply<T>(req: Request, res: Response, result: Result<T, Failure>, status: number): void {
    if (!result.ok) {
      const { status: failed, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale(req)), locale(req));
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

function locale(req: Request): string {
  return req.locale ?? 'en';
}
