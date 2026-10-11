import type { Request, Response } from 'express';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import type { ListShoppingItemsUseCase } from '@application/shopping/use-cases/list-shopping-items-use-case';
import type { GetShoppingSummaryUseCase } from '@application/shopping/use-cases/get-shopping-summary-use-case';
import type { AddShoppingItemsUseCase } from '@application/shopping/use-cases/add-shopping-items-use-case';
import type { UpdateShoppingItemUseCase } from '@application/shopping/use-cases/update-shopping-item-use-case';
import type { DeleteShoppingItemUseCase } from '@application/shopping/use-cases/delete-shopping-item-use-case';
import type { ClearShoppingListUseCase } from '@application/shopping/use-cases/clear-shopping-list-use-case';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';
import {
  AddShoppingItemsBodySchema,
  ShoppingItemIdParamSchema,
  UpdateShoppingItemBodySchema,
} from '@presentation/validators/shopping-list.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface ShoppingListUseCases {
  readonly list: ListShoppingItemsUseCase;
  readonly summary: GetShoppingSummaryUseCase;
  readonly add: AddShoppingItemsUseCase;
  readonly update: UpdateShoppingItemUseCase;
  readonly remove: DeleteShoppingItemUseCase;
  readonly clear: ClearShoppingListUseCase;
}

/** The signed-in user's shopping list — nobody else's is reachable from here. */
export class ShoppingListController {
  constructor(
    private readonly uc: ShoppingListUseCases,
    private readonly ts: TranslationService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.list.execute({ userId: requireUser(req).id, page, pageSize }), OK);
  };

  summary = async (req: Request, res: Response): Promise<void> => {
    this.reply(req, res, await this.uc.summary.execute(requireUser(req).id), OK);
  };

  add = async (req: Request, res: Response): Promise<void> => {
    const { items } = AddShoppingItemsBodySchema.parse(req.body);
    const result = await this.uc.add.execute({
      userId: requireUser(req).id,
      items: items.map((item) => ({
        label: item.label,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        recipeId: item.recipeId ?? null,
        recipeName: item.recipeName ?? null,
      })),
    });
    this.reply(req, res, result, CREATED);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = ShoppingItemIdParamSchema.parse(req.params);
    const body = UpdateShoppingItemBodySchema.parse(req.body);
    const result = await this.uc.update.execute({
      id,
      userId: requireUser(req).id,
      change: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.unit !== undefined ? { unit: body.unit } : {}),
        ...(body.checked !== undefined ? { checked: body.checked } : {}),
      },
    });
    this.reply(req, res, result, OK);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = ShoppingItemIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.remove.execute({ id, userId: requireUser(req).id }), NO_CONTENT);
  };

  clearChecked = async (req: Request, res: Response): Promise<void> => {
    this.reply(req, res, await this.uc.clear.execute({ userId: requireUser(req).id, checkedOnly: true }), OK);
  };

  clearAll = async (req: Request, res: Response): Promise<void> => {
    this.reply(req, res, await this.uc.clear.execute({ userId: requireUser(req).id, checkedOnly: false }), OK);
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
