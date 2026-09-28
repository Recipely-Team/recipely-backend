import type { Request, Response } from 'express';
import type { PublishRecipeUseCase } from '@application/recipes/publishing/publish-recipe-use-case';
import type { UnpublishRecipeUseCase } from '@application/recipes/publishing/unpublish-recipe-use-case';
import type { EditRecipeUseCase } from '@application/recipes/editing/edit-recipe-use-case';
import type { RecipeContentEdit } from '@domain/recipes/editing/recipe-content-edit';
import type { TranslationService } from '@application/i18n/translation-service';
import { EditRecipeBodySchema, RecipeIdParamSchema } from '@presentation/validators/recipes.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

/**
 * The owner's actions on a saved recipe's way to the public: edit it while it
 * is private, publish it, take it back.
 *
 * Kept apart from `RecipesController`, which is already past its size budget;
 * these are a separate capability — what the owner shows the world, and the
 * text they show — and read better on their own.
 */
export class RecipePublicationController {
  constructor(
    private readonly publishRecipe: PublishRecipeUseCase,
    private readonly unpublishRecipe: UnpublishRecipeUseCase,
    private readonly ts: TranslationService,
    private readonly editRecipe: EditRecipeUseCase,
  ) {}

  edit = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const { id } = RecipeIdParamSchema.parse(req.params);
    const changes: RecipeContentEdit = EditRecipeBodySchema.parse(req.body);

    const result = await this.editRecipe.execute({ recipeId: id, requesterId: user.id, changes, locale });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.json(result.value);
  };

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
