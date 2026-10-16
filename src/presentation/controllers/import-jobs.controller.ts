import type { Request, Response } from 'express';
import type { ImportFileRecipeUseCase } from '@application/imports/use-cases/import-file-recipe-use-case';
import type { EnqueueImportUseCase } from '@application/imports/use-cases/enqueue-import-use-case';
import type { GetImportJobUseCase } from '@application/imports/use-cases/get-import-job-use-case';
import type { ClaimImportJobUseCase } from '@application/imports/use-cases/claim-import-job-use-case';
import type { CompleteImportJobUseCase } from '@application/imports/use-cases/complete-import-job-use-case';
import type { FailImportJobUseCase } from '@application/imports/use-cases/fail-import-job-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import {
  EnqueueImportBodySchema,
  ImportJobIdParamSchema,
  claimAcceptsWeb, CompleteImportJobBodySchema,
  FailImportJobBodySchema,
} from '@presentation/validators/import-jobs.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';
import { requireWorker } from '@presentation/http/require-worker';

/** 202: accepted, not done. The whole point of the endpoint. */
const HTTP_ACCEPTED = 202;
/** 204: claimed nothing. An empty queue is not an error and carries no body. */
const HTTP_NO_CONTENT = 204;

export class ImportJobsController {
  constructor(
    private readonly enqueueUC: EnqueueImportUseCase,
    private readonly getJobUC: GetImportJobUseCase,
    private readonly claimUC: ClaimImportJobUseCase,
    private readonly completeUC: CompleteImportJobUseCase,
    private readonly failUC: FailImportJobUseCase,
    private readonly ts: TranslationService,
    private readonly importFileUC: ImportFileRecipeUseCase,
  ) {}

  /** `POST /recipes/import/file` — photos of a recipe or a PDF, read into a draft. */
  importFile = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
    const result = await this.importFileUC.execute({
      ownerId: user.id,
      locale,
      files: uploaded.map((f) => ({ mimeType: f.mimetype, bytes: f.buffer })),
    });
    if (!result.ok) {
      this.reject(res, result.failure, locale);
      return;
    }
    res.status(201).json(result.value);
  };

  private reject(res: Response, failure: Parameters<typeof failureToHttp>[0], locale: string): void {
    const { status, body } = failureToHttp(failure, (k, l) => this.ts.t(k, l), locale);
    res.status(status).json(body);
  }

  /** Records the request and returns; the work happens on a worker. */
  enqueue = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const parsed = EnqueueImportBodySchema.parse(req.body);

    const result = await this.enqueueUC.execute({
      ownerId: user.id,
      url: parsed.url,
      locale,
    });
    if (!result.ok) {
      this.reject(res, result.failure, locale);
      return;
    }

    res.status(HTTP_ACCEPTED).json(result.value);
  };

  /** Lets an open screen see the result without waiting for a push. */
  get = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const locale = req.locale ?? 'en';
    const { id } = ImportJobIdParamSchema.parse(req.params);

    const result = await this.getJobUC.execute({ jobId: id, requesterId: user.id });
    if (!result.ok) {
      this.reject(res, result.failure, locale);
      return;
    }

    res.json(result.value);
  };

  claim = async (req: Request, res: Response): Promise<void> => {
    const workerId = requireWorker(req);

    const result = await this.claimUC.execute({ workerId, acceptsWeb: claimAcceptsWeb(req.body) });
    if (!result.ok) {
      this.reject(res, result.failure, 'en');
      return;
    }
    if (result.value === null) {
      res.status(HTTP_NO_CONTENT).end();
      return;
    }

    res.json(result.value);
  };

  complete = async (req: Request, res: Response): Promise<void> => {
    const workerId = requireWorker(req);
    const { id } = ImportJobIdParamSchema.parse(req.params);
    const parsed = CompleteImportJobBodySchema.parse(req.body);

    const result = await this.completeUC.execute({
      jobId: id,
      workerId,
      recipe: parsed.recipe,
      coverFrameJpegBase64: parsed.coverFrameJpegBase64,
      locale: parsed.locale,
      ...(parsed.sourceHandle !== undefined ? { sourceHandle: parsed.sourceHandle } : {}),
      ...(parsed.sourcePlatform !== undefined ? { sourcePlatform: parsed.sourcePlatform } : {}),
      ...(parsed.aiWritten !== undefined ? { aiWritten: parsed.aiWritten } : {}),
      ...(parsed.reading !== undefined ? { reading: parsed.reading } : {}),
    });
    if (!result.ok) {
      this.reject(res, result.failure, 'en');
      return;
    }

    res.json(result.value);
  };

  fail = async (req: Request, res: Response): Promise<void> => {
    const workerId = requireWorker(req);
    const { id } = ImportJobIdParamSchema.parse(req.params);
    const parsed = FailImportJobBodySchema.parse(req.body);

    const result = await this.failUC.execute({ jobId: id, workerId, errorKey: parsed.errorKey });
    if (!result.ok) {
      this.reject(res, result.failure, 'en');
      return;
    }

    res.json(result.value);
  };
}
