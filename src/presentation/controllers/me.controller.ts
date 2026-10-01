import type { Request, Response } from 'express';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import type { ListMyLikedRecipesUseCase } from '@application/likes/use-cases/list-my-liked-recipes-use-case';
import type { UploadAvatarUseCase } from '@application/auth/use-cases/upload-avatar-use-case';
import type { UpdateMyProfileUseCase } from '@application/users/use-cases/update-my-profile-use-case';
import type { GetMyProfileUseCase } from '@application/users/use-cases/get-my-profile-use-case';
import type { RequestCreatorTagUseCase } from '@application/users/use-cases/request-creator-tag-use-case';
import type { RemoveCreatorTagUseCase } from '@application/users/use-cases/remove-creator-tag-use-case';
import type { DeleteAccountUseCase } from '@application/auth/use-cases/delete-account-use-case';
import type { ListMyDevicesUseCase } from '@application/devices/use-cases/list-my-devices-use-case';
import type { RecordMyDeviceUseCase } from '@application/devices/use-cases/record-my-device-use-case';
import { DeviceContextBodySchema } from '@presentation/validators/auth.validators';
import { deviceContextFromRequest } from '@presentation/http/device-context-from-request';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';
import { ValidationFailure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';
import {
  CreatorPlatformParamSchema,
  RequestCreatorTagBodySchema,
  UpdateMyProfileBodySchema,
} from '@presentation/validators/users.validators';

export class MeController {
  constructor(
    private readonly listRecipes: ListRecipesUseCase,
    private readonly listFavorites: ListMyFavoritesUseCase,
    private readonly ts: TranslationService,
    private readonly uploadAvatarUseCase: UploadAvatarUseCase,
    private readonly updateMyProfileUC: UpdateMyProfileUseCase,
    private readonly getMyProfileUC: GetMyProfileUseCase,
    private readonly deleteAccountUC: DeleteAccountUseCase,
    private readonly listLikedRecipes: ListMyLikedRecipesUseCase,
    private readonly listMyDevicesUC: ListMyDevicesUseCase,
    private readonly recordMyDeviceUC: RecordMyDeviceUseCase,
    private readonly requestCreatorTagUC: RequestCreatorTagUseCase,
    private readonly removeCreatorTagUC: RemoveCreatorTagUseCase,
    private readonly proxyDepth: number = 1,
  ) {}

  myRecipes = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const parsed = PaginationQuerySchema.parse(req.query);
    const result = await this.listRecipes.execute({
      ownerId: user.id,
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
    const user = requireUser(req);
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
      userId: user.id,
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
    const user = requireUser(req);
    const parsed = PaginationQuerySchema.parse(req.query);
    const result = await this.listFavorites.execute({
      userId: user.id,
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

  myLikes = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const parsed = PaginationQuerySchema.parse(req.query);
    const result = await this.listLikedRecipes.execute({
      userId: user.id,
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
    const user = requireUser(req);
    const result = await this.getMyProfileUC.execute(user.id);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  updateMyProfile = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const parsed = UpdateMyProfileBodySchema.parse(req.body);
    const result = await this.updateMyProfileUC.execute({
      userId: user.id,
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

  requestCreatorTag = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const parsed = RequestCreatorTagBodySchema.parse(req.body);
    const result = await this.requestCreatorTagUC.execute({
      userId: user.id,
      platform: parsed.platform,
      handle: parsed.handle,
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  removeCreatorTag = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const { platform } = CreatorPlatformParamSchema.parse(req.params);
    const result = await this.removeCreatorTagUC.execute({ userId: user.id, platform });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  deleteAccount = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const result = await this.deleteAccountUC.execute({ userId: user.id });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  myDevices = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const result = await this.listMyDevicesUC.execute(user.id);
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    // ipAddress/userAgent are deliberately not on DeviceRecord — those stay
    // admin-only.
    res.status(200).json(result.value);
  };

  recordMyDevice = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const device = DeviceContextBodySchema.parse(req.body);
    const result = await this.recordMyDeviceUC.execute({
      userId: user.id,
      device: deviceContextFromRequest(req, device, this.proxyDepth),
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };
}
