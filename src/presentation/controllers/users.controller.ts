import type { Request, Response } from 'express';
import type { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { FollowUserUseCase } from '@application/users/use-cases/follow-user-use-case';
import type { UnfollowUserUseCase } from '@application/users/use-cases/unfollow-user-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { UnauthorizedFailure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import { z } from 'zod';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';

const UserIdParamSchema = z.object({ id: z.string().uuid() });

export class UsersController {
  constructor(
    private readonly getUserProfile: GetUserProfileUseCase,
    private readonly listRecipes: ListRecipesUseCase,
    private readonly ts: TranslationService,
    private readonly followUser: FollowUserUseCase,
    private readonly unfollowUser: UnfollowUserUseCase,
  ) {}

  getProfile = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { id } = UserIdParamSchema.parse(req.params);
    const result = await this.getUserProfile.execute({
      userId: id,
      ...(req.user !== undefined ? { currentUserId: req.user.id } : {}),
    });
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

  follow = async (req: Request, res: Response): Promise<void> => {
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
    const { id: followingId } = UserIdParamSchema.parse(req.params);
    const result = await this.followUser.execute({ followerId: req.user.id, followingId });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  unfollow = async (req: Request, res: Response): Promise<void> => {
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
    const { id: followingId } = UserIdParamSchema.parse(req.params);
    const result = await this.unfollowUser.execute({ followerId: req.user.id, followingId });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };
}
