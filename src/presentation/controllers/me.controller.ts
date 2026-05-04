import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { UnauthorizedFailure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export class MeController {
  constructor(
    private readonly listRecipes: ListRecipesUseCase,
    private readonly listFavorites: ListMyFavoritesUseCase,
    private readonly ts: TranslationService,
  ) {}

  myRecipes = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    if (!req.user) {
      const { status, body } = failureToHttp(
        new UnauthorizedFailure('errors.unauthorized.missing_token'),
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    const parsed = PaginationQuerySchema.parse(req.query);
    const result = await this.listRecipes.execute({
      ownerId: req.user.id,
      includeUnpublished: true,
      page: parsed.page,
      pageSize: parsed.pageSize,
      locale,
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  myFavorites = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    if (!req.user) {
      const { status, body } = failureToHttp(
        new UnauthorizedFailure('errors.unauthorized.missing_token'),
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    const parsed = PaginationQuerySchema.parse(req.query);
    const result = await this.listFavorites.execute({
      userId: req.user.id,
      page: parsed.page,
      pageSize: parsed.pageSize,
      locale,
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };
}
