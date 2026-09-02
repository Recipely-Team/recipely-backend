import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import { ConflictFailure, ForbiddenFailure, type Failure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import type { ImportJobRepositoryInterface } from '@domain/imports/import-job-repository-interface';
import type { ImportCoverStoreInterface } from '@application/ai/ports/import-cover-store-interface';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import type { NotificationService } from '@application/notifications/notification-service';
import type { TranslationService } from '@application/i18n/translation-service';
import { ImportNotificationKeys } from '@application/imports/import-notification-keys';
import type { LoggerInterface } from '@application/ports/logger-interface';
import { ImportJobMapper } from '@application/imports/mappers/import-job.mapper';
import type { ImportJobDto } from '@application/imports/dtos/import-job.dto';

export interface CompleteImportJobInput {
  readonly jobId: string;
  /** The worker reporting in; must be the one that holds the claim. */
  readonly workerId: string;
  readonly recipe: GeneratedRecipeDto;
  /** A JPEG frame from the video, base64. Absent when ffmpeg produced none. */
  readonly coverFrameJpegBase64: string | null;
  /** The language the recipe was extracted in, for the notification copy. */
  readonly locale: string;
}

/**
 * Turns a finished import into something the user can open.
 *
 * @remarks
 * - **Why the API stores the cover and not the worker.** Covers are served off
 *   the API box's disk. A worker writing them would need that disk mounted,
 *   which is the one dependency that would stop a worker from being an
 *   anonymous box that only needs HTTPS and a secret.
 * - **Order matters: draft first, then the job, then the notification.** The
 *   notification is the thing that tells the user to go and look, so nothing
 *   may send it before the draft it points at exists. A notification arriving
 *   first opens an empty screen, which reads as a bug in the import.
 * - **Only the holder may report.** Without the check, a worker whose lease
 *   expired mid-import — and whose job has since been re-run by someone else —
 *   would come back and overwrite the newer result with its own stale one.
 */
export class CompleteImportJobUseCase {
  constructor(
    private readonly jobs: ImportJobRepositoryInterface,
    private readonly drafts: RecipeDraftRepositoryInterface,
    private readonly coverStore: ImportCoverStoreInterface,
    private readonly notifications: NotificationService,
    private readonly ts: TranslationService,
    private readonly logger: LoggerInterface,
  ) {}

  /**
   * Stores the cover frame, or gives up on it.
   *
   * Never fails the completion. A recipe whose ingredients and steps came
   * through is worth far more than its cover photo, and the user can set an
   * image themselves — losing a whole import to a failed disk write would be a
   * terrible trade.
   */
  private async storeCover(frameBase64: string | null): Promise<string> {
    if (frameBase64 === null) return '';
    try {
      return await this.coverStore.save(Buffer.from(frameBase64, 'base64'));
    } catch (err) {
      this.logger.warn({ err }, 'import_job_cover_store_failed');
      return '';
    }
  }

  async execute(input: CompleteImportJobInput): Promise<Result<ImportJobDto, Failure>> {
    const found = await this.jobs.getById(input.jobId);
    if (!found.ok) return found;

    const job = found.value;
    if (job.isFinished) {
      return { ok: false, failure: new ConflictFailure('errors.import.job_already_finished') };
    }
    if (job.claimedBy !== input.workerId) {
      return { ok: false, failure: new ForbiddenFailure('errors.import.job_not_claimed_by_worker') };
    }

    const image = await this.storeCover(input.coverFrameJpegBase64);
    const now = new Date();

    const draft = RecipeDraft.create({
      id: randomUUID(),
      ownerId: job.ownerId,
      prompt: job.url,
      snapshot: {
        name: input.recipe.title,
        cuisine: input.recipe.cuisine,
        category: input.recipe.category,
        difficulty: input.recipe.difficulty,
        prepTimeMinutes: input.recipe.prepTimeMinutes,
        cookTimeMinutes: input.recipe.cookTimeMinutes,
        servings: input.recipe.servings,
        ingredients: [...input.recipe.ingredients],
        instructions: [...input.recipe.instructions],
        tags: [...input.recipe.tags],
        mealType: [...input.recipe.mealType],
        tips: [...input.recipe.tips],
        caloriesPerServing: input.recipe.caloriesPerServing,
        nutrition: { ...input.recipe.nutrition },
        image,
        media: [],
      },
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
    });
    if (!draft.ok) return draft;

    const savedDraft = await this.drafts.upsert(draft.value);
    if (!savedDraft.ok) return savedDraft;

    const completed = job.complete(savedDraft.value.id, now);
    if (!completed.ok) return completed;

    const savedJob = await this.jobs.save(completed.value);
    if (!savedJob.ok) return savedJob;

    // Fire-and-forget by design: a push that fails must not un-import a recipe
    // that is already sitting in the user's drafts.
    void this.notifications
      .notify({
        recipientId: job.ownerId,
        type: 'import_done',
        draftId: savedDraft.value.id,
        title: this.ts.t(ImportNotificationKeys.doneTitle, input.locale),
        body: this.ts.t(ImportNotificationKeys.doneBody, input.locale, {
          title: input.recipe.title,
        }),
        // The recipe's name, stored on the notification so the IN-APP row can
        // show which import finished. The push body says it; the feed row had
        // nothing but a fixed sentence, so two imports produced two identical
        // rows and neither said what it had made.
        message: input.recipe.title,
      })
      .catch((err: unknown) => this.logger.warn({ err }, 'import_job_notify_failed'));

    return ok(ImportJobMapper.toDto(savedJob.value));
  }
}
