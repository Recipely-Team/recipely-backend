import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { CreatorPlatform } from '@domain/users/creator-platform';

const HANDLE_CHARACTERS = /^[a-z0-9._]+$/;
const LEADING_AT = /^@/;
const DOT = '.';
const DOUBLE_DOT = '..';

/** Each platform's own username length limits, in characters. */
const LENGTH_LIMITS: Readonly<Record<CreatorPlatform, { readonly min: number; readonly max: number }>> = {
  [CreatorPlatform.Instagram]: { min: 1, max: 30 },
  [CreatorPlatform.TikTok]: { min: 2, max: 24 },
};

/**
 * A creator's account name on one platform, normalised and validated.
 *
 * The rules are the contract's (`docs/creator-tag-contract.md`); the app checks
 * the same ones for fast feedback, but this is the authority:
 * - a leading `@` is stripped, surrounding whitespace dropped, then lowercased;
 * - only `a-z`, `0-9`, `.` and `_`;
 * - Instagram 1–30 characters, TikTok 2–24;
 * - no leading or trailing `.`, and no `..`.
 */
export class CreatorHandle {
  private constructor(
    readonly platform: CreatorPlatform,
    readonly value: string,
  ) {}

  static create(platform: CreatorPlatform, raw: string): Result<CreatorHandle, ValidationFailure> {
    const handle = raw.trim().replace(LEADING_AT, '').toLowerCase();
    const limits = LENGTH_LIMITS[platform];
    const valid =
      handle.length >= limits.min &&
      handle.length <= limits.max &&
      HANDLE_CHARACTERS.test(handle) &&
      !handle.startsWith(DOT) &&
      !handle.endsWith(DOT) &&
      !handle.includes(DOUBLE_DOT);
    if (!valid) {
      return fail(new ValidationFailure('errors.validation.creator_handle', 'handle'));
    }
    return ok(new CreatorHandle(platform, handle));
  }

  equals(other: CreatorHandle): boolean {
    return this.platform === other.platform && this.value === other.value;
  }
}
