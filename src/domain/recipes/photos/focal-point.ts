import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

const MIN = 0;
const MAX = 1;

/**
 * Where the dish sits in a photo: `x` from the left edge and `y` from the top,
 * each a share of the frame in 0..1.
 *
 * @remarks
 * - **Why it exists.** A card or a hero crops its photo to a fixed shape, and a
 *   centred crop of a hand-held reel frame lands on a wrist or a pot rim as
 *   often as on the food. Clients position the crop on this point instead.
 * - **`create` rejects, `clamped` forgives.** A stored value outside the frame
 *   is a corrupt row and is refused; a model's answer a hair past an edge is
 *   still an answer, so the detector clamps it onto the frame. Neither accepts
 *   a non-number — NaN has no side of the frame to be clamped to.
 */
export class FocalPoint {
  private constructor(
    private readonly px: number,
    private readonly py: number,
  ) {}

  static create(x: number, y: number): Result<FocalPoint, ValidationFailure> {
    if (!FocalPoint.inFrame(x) || !FocalPoint.inFrame(y)) {
      return fail(new ValidationFailure('errors.validation.image_invalid', 'focus'));
    }
    return ok(new FocalPoint(x, y));
  }

  static clamped(x: number, y: number): Result<FocalPoint, ValidationFailure> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return fail(new ValidationFailure('errors.validation.image_invalid', 'focus'));
    }
    return ok(new FocalPoint(FocalPoint.clamp(x), FocalPoint.clamp(y)));
  }

  get x(): number { return this.px; }
  get y(): number { return this.py; }

  equals(other: FocalPoint): boolean {
    return this.px === other.px && this.py === other.py;
  }

  private static inFrame(n: number): boolean {
    return Number.isFinite(n) && n >= MIN && n <= MAX;
  }

  private static clamp(n: number): number {
    return Math.min(MAX, Math.max(MIN, n));
  }
}
