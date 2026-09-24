import type { Request, Response } from 'express';
import type { PublishRecipeUseCase } from '@application/recipes/publishing/publish-recipe-use-case';
import type { UnpublishRecipeUseCase } from '@application/recipes/publishing/unpublish-recipe-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import { RecipeIdParamSchema } from '@presentation/validators/recipes.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

/**
 * The owner's two visibility actions on a saved recipe.
 *
 * Kept apart from `RecipesController`, which is already past its size budget;
 * these are a separate capability — what the owner shows the world — and read
 * better on their own.
 */
export class RecipePublicationController {
  constructor(
    private readonly publishRecipe: PublishRecipeUseCase,
    private readonly unpublishRecipe: UnpublishRecipeUseCase,
    private readonly ts: TranslationService,
  ) {}

  publish = async (req: Request, res: Response): Promise<void> => {
    await this.respond(req, res, (recipeId, requesterId) => this.publishRecipe.execute({ recipeId, requesterId }));
  };

  unpublish = async (req: Request, res: Response): Promise<void> => {
    await this.respond(req, res, (recipeId, requesterId) => this.unpublishRecipe.execute({ recipeId, requesterId }));
  };

  private async respond(
    req: Request,
    res: Response,
    run: (recipeId: string, requesterId: string) => ReturnType<PublishRecipeUseCase['execute']>,
  ): Promise<void> {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const { id } = RecipeIdParamSchema.parse(req.params);

    const result = await run(id, user.id);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.json(result.value);
  }
}
