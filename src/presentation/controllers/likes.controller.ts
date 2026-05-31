import type { Request, Response } from 'express';
import type { LikeRecipeUseCase } from '@application/likes/use-cases/like-recipe-use-case';
import type { UnlikeRecipeUseCase } from '@application/likes/use-cases/unlike-recipe-use-case';
import { RecipeIdParamSchema } from '@presentation/validators/recipes.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';
import type { TranslationService } from '@application/i18n/translation-service';

export class LikesController {
  constructor(
    private readonly likeRecipe: LikeRecipeUseCase,
    private readonly unlikeRecipe: UnlikeRecipeUseCase,
    private readonly ts: TranslationService,
  ) {}

  like = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const { id } = RecipeIdParamSchema.parse(req.params);
    const result = await this.likeRecipe.execute(user.id, id);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  unlike = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const { id } = RecipeIdParamSchema.parse(req.params);
    const result = await this.unlikeRecipe.execute(user.id, id);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };
}
