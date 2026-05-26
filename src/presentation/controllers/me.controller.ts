import type { Request, Response } from 'express';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import type { UploadAvatarUseCase } from '@application/auth/use-cases/upload-avatar-use-case';
import type { UpdateMyProfileUseCase } from '@application/users/use-cases/update-my-profile-use-case';
import type { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { UnauthorizedFailure, ValidationFailure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';
import { UpdateMyProfileBodySchema } from '@presentation/validators/users.validators';

export class MeController {
  constructor(
    private readonly listRecipes: ListRecipesUseCase,
    private readonly listFavorites: ListMyFavoritesUseCase,
    private readonly ts: TranslationService,
    private readonly uploadAvatarUseCase: UploadAvatarUseCase,
    private readonly updateMyProfileUC: UpdateMyProfileUseCase,
    private readonly getUserProfileUC: GetUserProfileUseCase,
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

  uploadAvatar = async (req: Request, res: Response): Promise<void> => {
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
    if (!req.file) {
      const { status, body } = failureToHttp(
        new ValidationFailure('errors.validation.file_required', 'file'),
        (key) => this.ts.t(key, locale),
        locale,
      );
      res.status(status).json(body);
      return;
    }
    const result = await this.uploadAvatarUseCase.execute({
      userId: req.user.id,
      fileBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      fileSizeBytes: req.file.size,
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json({ user: result.value });
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

  getMyProfile = async (req: Request, res: Response): Promise<void> => {
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
    const result = await this.getUserProfileUC.execute({ userId: req.user.id, currentUserId: req.user.id });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  updateMyProfile = async (req: Request, res: Response): Promise<void> => {
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
    const parsed = UpdateMyProfileBodySchema.parse(req.body);
    const result = await this.updateMyProfileUC.execute({
      userId: req.user.id,
      ...(parsed.displayName !== undefined ? { displayName: parsed.displayName } : {}),
      ...(parsed.bio !== undefined ? { bio: parsed.bio } : {}),
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json({ user: result.value });
  };
}
