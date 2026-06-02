import type { Request, Response } from 'express';
import type { UpsertDraftUseCase } from '@application/drafts/use-cases/upsert-draft-use-case';
import type { GetDraftUseCase } from '@application/drafts/use-cases/get-draft-use-case';
import type { ListDraftsUseCase } from '@application/drafts/use-cases/list-drafts-use-case';
import type { GetLatestDraftUseCase } from '@application/drafts/use-cases/get-latest-draft-use-case';
import type { DeleteDraftUseCase } from '@application/drafts/use-cases/delete-draft-use-case';
import type { RefineRecipeUseCase } from '@application/ai/use-cases/refine-recipe-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import type { DraftRecipeSnapshot, ChatMessage } from '@domain/drafts/recipe-draft';
import {
  UpsertDraftBodySchema,
  DraftIdParamSchema,
  RefineDraftBodySchema,
  ListDraftsQuerySchema,
} from '@presentation/validators/drafts.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

export class DraftsController {
  constructor(
    private readonly upsertDraftUC: UpsertDraftUseCase,
    private readonly getDraftUC: GetDraftUseCase,
    private readonly listDraftsUC: ListDraftsUseCase,
    private readonly getLatestDraftUC: GetLatestDraftUseCase,
    private readonly deleteDraftUC: DeleteDraftUseCase,
    private readonly refineRecipeUC: RefineRecipeUseCase,
    private readonly ts: TranslationService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const parsed = ListDraftsQuerySchema.parse(req.query);

    const result = await this.listDraftsUC.execute({
      ownerId: user.id,
      page: parsed.page,
      pageSize: parsed.pageSize,
    });

    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  getLatest = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';

    const result = await this.getLatestDraftUC.execute({ ownerId: user.id });

    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const { id } = DraftIdParamSchema.parse(req.params);

    const result = await this.getDraftUC.execute({ id, requesterId: user.id });

    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  upsert = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const { id } = DraftIdParamSchema.parse(req.params);
    const parsed = UpsertDraftBodySchema.parse({ ...req.body, id });

    const result = await this.upsertDraftUC.execute({
      id: parsed.id,
      ownerId: user.id,
      prompt: parsed.prompt,
      snapshot: parsed.snapshot as unknown as DraftRecipeSnapshot,
      chatHistory: parsed.chatHistory as unknown as ChatMessage[],
    });

    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const { id } = DraftIdParamSchema.parse(req.params);

    const result = await this.deleteDraftUC.execute({ id, requesterId: user.id });

    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  refine = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const parsed = RefineDraftBodySchema.parse(req.body);

    const result = await this.refineRecipeUC.execute({
      ownerId: user.id,
      currentRecipe: parsed.currentRecipe as unknown as DraftRecipeSnapshot,
      instruction: parsed.instruction,
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
