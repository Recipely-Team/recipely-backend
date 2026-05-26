import type { Request, Response } from 'express';
import type { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';
import { z } from 'zod';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';

const UserIdParamSchema = z.object({ id: z.string().uuid() });

export class UsersController {
  constructor(
    private readonly getUserProfile: GetUserProfileUseCase,
    private readonly listRecipes: ListRecipesUseCase,
    private readonly ts: TranslationService,
  ) {}

  getProfile = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { id } = UserIdParamSchema.parse(req.params);
    const result = await this.getUserProfile.execute({ userId: id });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  getRecipes = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { id } = UserIdParamSchema.parse(req.params);
    const parsed = PaginationQuerySchema.parse(req.query);
    const result = await this.listRecipes.execute({
      ownerId: id,
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
