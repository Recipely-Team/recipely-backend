import type { Request, Response } from 'express';
import type { AddCommentUseCase } from '@application/comments/use-cases/add-comment-use-case';
import type { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';
import type { ListCommentsUseCase } from '@application/comments/use-cases/list-comments-use-case';
import { RecipeIdParamSchema } from '@presentation/validators/recipes.validators';
import { AddCommentBodySchema, CommentIdParamSchema, ListCommentsQuerySchema } from '@presentation/validators/comments.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { UnauthorizedFailure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';

export class CommentsController {
  constructor(
    private readonly addComment: AddCommentUseCase,
    private readonly deleteComment: DeleteCommentUseCase,
    private readonly listComments: ListCommentsUseCase,
    private readonly ts: TranslationService,
  ) {}

  add = async (req: Request, res: Response): Promise<void> => {
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
    const { id: recipeId } = RecipeIdParamSchema.parse(req.params);
    const parsed = AddCommentBodySchema.parse(req.body);
    const result = await this.addComment.execute({
      recipeId,
      authorId: req.user.id,
      body: parsed.body,
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
    });
    if (!result.ok) {
      const { status, body: errBody } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(errBody);
      return;
    }
    res.status(201).json(result.value);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
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
    const { commentId } = CommentIdParamSchema.parse(req.params);
    const result = await this.deleteComment.execute({ commentId, requesterId: req.user.id });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { id: recipeId } = RecipeIdParamSchema.parse(req.params);
    const { page, pageSize } = ListCommentsQuerySchema.parse(req.query);
    const result = await this.listComments.execute({ recipeId, page, pageSize });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };
}
