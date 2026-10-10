import { fail, ok, type Result } from '@core/result/result';
import {
  ServiceUnavailableFailure,
  TooManyRequestsFailure,
  UnprocessableFailure,
  ValidationFailure,
  type Failure,
} from '@core/failure';
import { foldText } from '@domain/common/fold-text';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { IngredientConfidence } from '@domain/fridge/ingredient-confidence';
import type { FridgeUsageRepositoryInterface } from '@domain/fridge/fridge-usage-repository-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import type { ImageModeratorInterface } from '@application/ai/ports/image-moderator-interface';
import type { MealPhotoPreparerInterface } from '@application/diary/ports/meal-photo-preparer-interface';
import { startOfUtcDay } from '@application/assistant/start-of-utc-day';
import { UploadRules } from '@application/imports/upload-rules';
import type { DetectedIngredient, FridgePhoto, FridgeScannerInterface } from '@application/fridge/ports/fridge-scanner-interface';
import { FridgeLimits } from '@application/fridge/fridge-limits';
import type { FridgeScanDto } from '@application/fridge/dtos/fridge-scan.dto';
import type { FridgeIngredientDto } from '@application/fridge/dtos/fridge-ingredient.dto';

export interface ScanFridgeInput {
  readonly userId: string;
  readonly locale: string;
  readonly photos: readonly { readonly bytes: Buffer; readonly mimeType: string }[];
}

const WHITESPACE_RUN = /\s+/g;

/**
 * One to three fridge or pantry photos in, the ingredients on them out.
 *
 * @remarks
 * - **Cheapest refusal first**: photo count and declared type, then the daily
 *   allowance (shared with idea requests), and only then the paid calls —
 *   every photo through the image moderator, then the scanner.
 * - **Photos are moderated fail-closed**, as every photo here is: "we could
 *   not check it" is a retry (`errors.fridge.photo_unchecked`), never an
 *   approval. One rejected photo rejects the scan and keeps the attempt.
 * - **Refunds**: a photo we could not decode, a moderator we could not reach
 *   and a scanner outage give the attempt back. Nothing recognised does not —
 *   the model did its work.
 * - **Names are model text**: lower-cased, trimmed to 40 characters,
 *   deduplicated (a `high` duplicate wins over a `low` one), and each passes
 *   the word list; a flagged one is dropped rather than shown.
 * - **Privacy**: the photos live only in this request's memory.
 */
export class ScanFridgeUseCase {
  constructor(
    private readonly scanner: FridgeScannerInterface,
    private readonly usage: FridgeUsageRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
    private readonly imageModerator: ImageModeratorInterface,
    private readonly photos: MealPhotoPreparerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ScanFridgeInput): Promise<Result<FridgeScanDto, Failure>> {
    if (input.photos.length === 0) return fail(new ValidationFailure('errors.fridge.no_photos', 'photos'));
    if (input.photos.length > FridgeLimits.maxPhotos) return fail(new ValidationFailure('errors.fridge.too_many_photos', 'photos'));
    if (input.photos.some((photo) => !UploadRules.imageType.test(photo.mimeType))) {
      return fail(new ValidationFailure('errors.fridge.unsupported_photo', 'photos'));
    }

    const day = startOfUtcDay(this.now());
    const used = await this.usage.consume(input.userId, day);
    if (!used.ok) return used;
    if (used.value > FridgeLimits.dailyPerUser) return fail(new TooManyRequestsFailure('errors.fridge.quota_exceeded'));

    const checked = await this.checkedPhotos(input.photos);
    if (!checked.ok) {
      if (checked.failure.messageKey !== 'errors.fridge.photo_rejected') await this.usage.refund(input.userId, day);
      return checked;
    }

    const scanned = await this.scanner.scan({ photos: checked.value, locale: input.locale });
    if (!scanned.ok) {
      await this.usage.refund(input.userId, day);
      return scanned;
    }

    const ingredients = this.clean(scanned.value, input.locale);
    if (ingredients.length === 0) return fail(new UnprocessableFailure('errors.fridge.nothing_recognised', 'photos'));
    return ok({ ingredients });
  }

  private async checkedPhotos(uploads: ScanFridgeInput['photos']): Promise<Result<FridgePhoto[], Failure>> {
    const prepared: FridgePhoto[] = [];
    for (const upload of uploads) {
      const photo = await this.photos.prepare(upload.bytes);
      if (!photo.ok) return fail(new UnprocessableFailure('errors.fridge.unsupported_photo', 'photos'));
      prepared.push(photo.value);
    }
    const verdicts = await Promise.all(prepared.map((photo) => this.imageModerator.moderate(photo)));
    if (verdicts.some((verdict) => !verdict.ok)) return fail(new ServiceUnavailableFailure('errors.fridge.photo_unchecked'));
    if (verdicts.some((verdict) => verdict.ok && verdict.value.status === ModerationStatus.Rejected)) {
      return fail(new UnprocessableFailure('errors.fridge.photo_rejected', 'photos'));
    }
    return ok(prepared);
  }

  private clean(detected: readonly DetectedIngredient[], locale: string): FridgeIngredientDto[] {
    const byKey = new Map<string, FridgeIngredientDto>();
    for (const item of detected) {
      const name = item.name.replace(WHITESPACE_RUN, ' ').trim().toLocaleLowerCase(locale).slice(0, FridgeLimits.ingredientMaxChars).trim();
      if (name.length === 0) continue;
      if (this.contentModerator.moderate({ text: name }).status !== ModerationStatus.Approved) continue;
      const key = foldText(name);
      const seen = byKey.get(key);
      if (seen === undefined) {
        if (byKey.size < FridgeLimits.maxScanIngredients) byKey.set(key, { name, confidence: item.confidence });
      } else if (seen.confidence === IngredientConfidence.Low && item.confidence === IngredientConfidence.High) {
        byKey.set(key, { ...seen, confidence: IngredientConfidence.High });
      }
    }
    return [...byKey.values()];
  }
}
