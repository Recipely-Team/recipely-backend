import { FocalPoint } from '@domain/recipes/photos/focal-point';

describe('FocalPoint', () => {
  it('accepts both edges of the frame', () => {
    expect(FocalPoint.create(0, 1).ok).toBe(true);
    expect(FocalPoint.create(1, 0).ok).toBe(true);
  });

  it.each([
    [-0.01, 0.5],
    [0.5, 1.01],
    [Number.NaN, 0.5],
    [0.5, Number.POSITIVE_INFINITY],
  ])('create refuses a point off the frame (%p, %p)', (x, y) => {
    expect(FocalPoint.create(x, y).ok).toBe(false);
  });

  it('clamped pulls a point a hair past an edge back onto it', () => {
    const p = FocalPoint.clamped(-0.2, 1.3);
    if (!p.ok) throw new Error('expected a point');
    expect([p.value.x, p.value.y]).toEqual([0, 1]);
  });

  it('clamped still refuses a non-number, which has no edge to be clamped to', () => {
    expect(FocalPoint.clamped(Number.NaN, 0.5).ok).toBe(false);
  });

  it('compares by value', () => {
    const a = FocalPoint.create(0.3, 0.4);
    const b = FocalPoint.create(0.3, 0.4);
    if (!a.ok || !b.ok) throw new Error('expected points');
    expect(a.value.equals(b.value)).toBe(true);
  });
});
