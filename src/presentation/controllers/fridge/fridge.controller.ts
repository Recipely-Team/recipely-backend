import type { Request, Response } from 'express';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import type { ScanFridgeUseCase } from '@application/fridge/use-cases/scan-fridge-use-case';
import type { SuggestFridgeIdeasUseCase } from '@application/fridge/use-cases/suggest-fridge-ideas-use-case';
import { FridgeIdeasBodySchema, FridgeScanFieldsSchema } from '@presentation/validators/fridge/fridge.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

const OK = 200;

/** "Cook from my fridge": read ingredients off photos, then suggest dishes from them. */
export class FridgeController {
  constructor(
    private readonly scanFridge: ScanFridgeUseCase,
    private readonly suggestIdeas: SuggestFridgeIdeasUseCase,
    private readonly ts: TranslationService,
  ) {}

  scan = async (req: Request, res: Response): Promise<void> => {
    const fields = FridgeScanFieldsSchema.parse(req.body ?? {});
    const files = Array.isArray(req.files) ? req.files : [];
    const result = await this.scanFridge.execute({
      userId: requireUser(req).id,
      locale: fields.locale ?? req.locale ?? 'en',
      photos: files.map((file) => ({ bytes: file.buffer, mimeType: file.mimetype })),
    });
    this.reply(req, res, result);
  };

  ideas = async (req: Request, res: Response): Promise<void> => {
    const body = FridgeIdeasBodySchema.parse(req.body);
    const result = await this.suggestIdeas.execute({
      userId: requireUser(req).id,
      ingredients: body.ingredients,
      maxMinutes: body.maxMinutes ?? null,
      diet: body.diet,
      servings: body.servings ?? null,
      exclude: body.exclude,
      locale: body.locale ?? req.locale ?? 'en',
    });
    this.reply(req, res, result);
  };

  private reply<T>(req: Request, res: Response, result: Result<T, Failure>): void {
    if (!result.ok) {
      const locale = req.locale ?? 'en';
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(OK).json(result.value);
  }
}
