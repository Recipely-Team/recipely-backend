import { z } from 'zod';
import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { FocalPoint } from '@domain/recipes/photos/focal-point';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';

const FocusResponseSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();

/**
 * Reads a vision model's reply into a `FocalPoint`.
 *
 * Strict: two finite numbers and no other key. A value a little outside 0..1
 * is clamped onto the frame (a model rounding past an edge still meant that
 * edge); anything else is a failure, which the sweep records as "no focus".
 */
export function parsePhotoFocusResponse(rawText: string): Result<FocalPoint, Failure> {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlock(rawText));
  } catch {
    return fail(new ServiceUnavailableFailure('errors.ai.invalid_response'));
  }
  const parsed = FocusResponseSchema.safeParse(json);
  if (!parsed.success) return fail(new ServiceUnavailableFailure('errors.ai.invalid_response'));
  const point = FocalPoint.clamped(parsed.data.x, parsed.data.y);
  return point.ok ? point : fail(new ServiceUnavailableFailure('errors.ai.invalid_response'));
}
