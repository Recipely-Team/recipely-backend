import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { isImageLicense, type ImageLicenseType } from '@domain/recipes/curated/image-license';

const INVALID = 'errors.validation.image_credit_invalid';
const HTTPS = 'https:';

/** The raw credit columns, or a dataset file's credit, before validation. */
export interface ImageCreditSnapshot {
  readonly author: string;
  readonly license: string;
  readonly url: string;
}

/**
 * **Who took a cover photo, under which licence, and where it was found.**
 *
 * @remarks
 * - Value object of the `Recipe` aggregate, set only on curated recipes; a
 *   recipe without one holds `null`, never an empty instance.
 * - **Only reusable licences** — `license` must be in `ImageLicense`, so NC,
 *   ND and unknown licences never construct.
 * - **The source page is `https`**: it is a link the app opens, and the credit
 *   is the proof the photo may be used, so it must point somewhere checkable.
 */
export class ImageCredit {
  private constructor(
    private readonly authorName: string,
    private readonly licenseName: ImageLicenseType,
    private readonly sourceUrl: string,
  ) {}

  static create(raw: ImageCreditSnapshot): Result<ImageCredit, ValidationFailure> {
    const author = raw.author.trim();
    if (author.length === 0) return fail(new ValidationFailure(INVALID, 'imageCredit.author'));
    const license = raw.license.trim();
    if (!isImageLicense(license)) return fail(new ValidationFailure(INVALID, 'imageCredit.license'));
    const url = raw.url.trim();
    if (!ImageCredit.isHttpsUrl(url)) return fail(new ValidationFailure(INVALID, 'imageCredit.url'));
    return ok(new ImageCredit(author, license, url));
  }

  private static isHttpsUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === HTTPS && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  get author(): string { return this.authorName; }
  get license(): ImageLicenseType { return this.licenseName; }
  get url(): string { return this.sourceUrl; }

  toSnapshot(): ImageCreditSnapshot {
    return { author: this.authorName, license: this.licenseName, url: this.sourceUrl };
  }
}
