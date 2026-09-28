import { FocalPoint } from '@domain/recipes/photos/focal-point';

/**
 * Reads a stored focus pair back into a `FocalPoint`.
 *
 * Both columns or nothing: a half-written pair, or a value outside the frame,
 * reads as "no focus" — the client then centres the crop, which is what it did
 * before the columns existed, rather than failing the whole recipe over it.
 */
export function focalPointFromColumns(x: number | null | undefined, y: number | null | undefined): FocalPoint | undefined {
  if (x === null || x === undefined || y === null || y === undefined) return undefined;
  const point = FocalPoint.create(x, y);
  return point.ok ? point.value : undefined;
}
