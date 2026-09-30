import type { Request, Response } from 'express';
import type { LikeCommentUseCase } from '@application/likes/use-cases/like-comment-use-case';
import type { UnlikeCommentUseCase } from '@application/likes/use-cases/unlike-comment-use-case';
import { CommentIdParamSchema } from '@presentation/validators/comments.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';
import type { TranslationService } from '@application/i18n/translation-service';

export class CommentLikesController {
  constructor(
    private readonly likeComment: LikeCommentUseCase,
    private readonly unlikeComment: UnlikeCommentUseCase,
    private readonly ts: TranslationService,
  ) {}

  like = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const { commentId } = CommentIdParamSchema.parse(req.params);
    const result = await this.likeComment.execute(user.id, commentId);
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
    const { commentId } = CommentIdParamSchema.parse(req.params);
    const result = await this.unlikeComment.execute(user.id, commentId);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };
}
