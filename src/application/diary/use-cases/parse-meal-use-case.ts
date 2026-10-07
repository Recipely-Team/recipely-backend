import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { MealParseUsageRepositoryInterface } from '@domain/diary/meal-parse-usage-repository-interface';
import { fail, ok, type Result } from '@core/result/result';
import {
  ServiceUnavailableFailure,
  TooManyRequestsFailure,
  UnprocessableFailure,
  ValidationFailure,
  type Failure,
} from '@core/failure';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import type { ImageModeratorInterface } from '@application/ai/ports/image-moderator-interface';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import { startOfUtcDay } from '@application/assistant/start-of-utc-day';
import { UploadRules } from '@application/imports/upload-rules';
import type { MealParseInput, MealParserInterface } from '@application/diary/ports/meal-parser-interface';
import type { MealPhotoPreparerInterface } from '@application/diary/ports/meal-photo-preparer-interface';
import type { MealParseDto } from '@application/diary/dtos/meal-parse.dto';
import { MealParseLimits } from '@application/diary/meal-parse-limits';
import { MealParseNote } from '@application/diary/meal-parse-note';
import { matchMealItem } from '@application/diary/match-meal-item';

export interface ParseMealInput {
  readonly userId: string;
  readonly locale: string;
  readonly text?: string;
  readonly photo?: { readonly bytes: Buffer; readonly mimeType: string };
}

/**
 * Text or a plate photo in, candidate diary items out — nothing is written.
 *
 * @remarks
 * - **Cheapest refusal first**: shape, then the word-list moderator (free),
 *   then the daily quota, and only then the calls that cost money — the photo
 *   moderator and the parser.
 * - **A photo is moderated fail-closed**, as every photo here is: "we could
 *   not check it" is a retry, never an approval.
 * - **Labels are model text**, so each passes the word list too; a flagged
 *   one is dropped rather than shown.
 * - **Privacy**: the input is never logged or stored; the photo lives only in
 *   this request's memory.
 */
export class ParseMealUseCase {
  constructor(
    private readonly parser: MealParserInterface,
    private readonly catalog: FoodCatalogInterface,
    private readonly usage: MealParseUsageRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
    private readonly imageModerator: ImageModeratorInterface,
    private readonly photos: MealPhotoPreparerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ParseMealInput): Promise<Result<MealParseDto, Failure>> {
    const text = input.text?.trim() ?? '';
    const hasText = text.length > 0;
    if (hasText === (input.photo !== undefined)) return fail(new ValidationFailure('errors.meal_parse.input_required'));
    if (hasText) {
      if (text.length > MealParseLimits.maxTextChars) return fail(new ValidationFailure('errors.meal_parse.text_too_long', 'text'));
      const verdict = this.contentModerator.moderate({ text, context: 'general' });
      if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));
    } else if (input.photo !== undefined && !UploadRules.imageType.test(input.photo.mimeType)) {
      return fail(new ValidationFailure('errors.meal_parse.unsupported_photo', 'photo'));
    }

    const used = await this.usage.consume(input.userId, startOfUtcDay(this.now()));
    if (!used.ok) return used;
    if (used.value > MealParseLimits.dailyPerUser) return fail(new TooManyRequestsFailure('errors.meal_parse.quota_exceeded'));

    const parseInput = input.photo !== undefined ? await this.checkedPhoto(input.photo) : ok<MealParseInput>({ text });
    if (!parseInput.ok) return parseInput;

    const parsed = await this.parser.parse({ input: parseInput.value, locale: input.locale });
    if (!parsed.ok) return parsed;

    const clean = parsed.value
      .slice(0, MealParseLimits.maxItems)
      .filter((item) => this.contentModerator.moderate({ text: item.label }).status === ModerationStatus.Approved);
    const items = await Promise.all(clean.map((item) => matchMealItem(this.catalog, item, input.locale)));

    if (items.length === 0) return ok({ items, note: MealParseNote.NothingDetected });
    if (items.some((item) => item.estimated)) return ok({ items, note: MealParseNote.SomeEstimated });
    return ok({ items });
  }

  private async checkedPhoto(photo: { bytes: Buffer }): Promise<Result<MealParseInput, Failure>> {
    const prepared = await this.photos.prepare(photo.bytes);
    if (!prepared.ok) return prepared;
    const verdict = await this.imageModerator.moderate(prepared.value);
    if (!verdict.ok) return fail(new ServiceUnavailableFailure('errors.meal_parse.photo_unchecked'));
    if (verdict.value.status === ModerationStatus.Rejected) {
      return fail(new UnprocessableFailure('errors.meal_parse.photo_rejected', 'photo'));
    }
    return ok({ photo: prepared.value });
  }
}
