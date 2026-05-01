import type { Request, Response } from 'express';
import type { ListCategoriesUseCase } from '@application/categories/use-cases/list-categories-use-case';
import { ListCategoriesQuerySchema } from '@presentation/validators/categories.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';

export class CategoriesController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly ts: TranslationService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = ListCategoriesQuerySchema.parse(req.query);
    const locale = req.locale ?? 'en';
    const result = await this.listCategories.execute({
      page: parsed.page,
      pageSize: parsed.pageSize,
      locale,
    });
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
}