import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { NutrientsPerPortionDto } from '@application/diary/dtos/nutrients-per-portion.dto';

/** What the user gave: words, or one prepared (bounded JPEG) photo. */
export type MealParseInput =
  | { readonly text: string }
  | { readonly photo: { readonly image: Buffer; readonly mimeType: string } };

/** One thing the model saw on the plate, before it is matched to our data. */
export interface DetectedMealItem {
  /** As the user would name it, in their locale. */
  readonly label: string;
  /** A short catalogue search term (e.g. "ekmek"), in the user's locale. */
  readonly searchTerm: string;
  /** The model's portion estimate. */
  readonly grams: number;
  /** The model's own nutrient estimate for that portion — the fallback. */
  readonly estimate: NutrientsPerPortionDto;
  readonly confidence: number;
}

/**
 * Reads the items of a meal out of text or a photo.
 *
 * @remarks
 * - **Candidates only.** Nothing it answers is written anywhere; the user
 *   confirms each item and the app logs it through the entry endpoints.
 * - **Never logs the input.** Neither the text nor the photo leaves this call
 *   except to the model.
 */
export interface MealParserInterface {
  parse(req: { readonly input: MealParseInput; readonly locale: string }): Promise<Result<readonly DetectedMealItem[], Failure>>;
}
