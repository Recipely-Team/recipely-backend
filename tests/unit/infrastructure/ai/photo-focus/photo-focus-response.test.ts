import { parsePhotoFocusResponse } from '@infrastructure/ai/photo-focus/photo-focus-response';

describe('parsePhotoFocusResponse', () => {
  it('reads a bare JSON point', () => {
    const r = parsePhotoFocusResponse('{"x": 0.42, "y": 0.61}');
    if (!r.ok) throw new Error('expected a point');
    expect([r.value.x, r.value.y]).toEqual([0.42, 0.61]);
  });

  it('reads a point wrapped in a code fence', () => {
    const r = parsePhotoFocusResponse('```json\n{"x": 0.5, "y": 0.2}\n```');
    expect(r.ok && [r.value.x, r.value.y]).toEqual([0.5, 0.2]);
  });

  it('clamps a value past an edge onto the frame', () => {
    const r = parsePhotoFocusResponse('{"x": 1.08, "y": -0.03}');
    expect(r.ok && [r.value.x, r.value.y]).toEqual([1, 0]);
  });

  it.each([
    ['not json at all'],
    ['{"x": "0.5", "y": 0.5}'],
    ['{"x": 0.5}'],
    ['{"x": 0.5, "y": 0.5, "label": "pasta"}'],
    ['{"x": null, "y": 0.5}'],
  ])('fails on a reply that is not exactly two numbers: %s', (raw) => {
    const r = parsePhotoFocusResponse(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.ai.invalid_response');
  });
});
