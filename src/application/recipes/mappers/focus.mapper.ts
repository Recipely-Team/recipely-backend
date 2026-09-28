import type { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { FocusDto } from '@application/recipes/dtos/focus.dto';

/** A focal point as it travels: a plain `{ x, y }`, never the value object. */
export function toFocusDto(point: FocalPoint): FocusDto {
  return { x: point.x, y: point.y };
}
