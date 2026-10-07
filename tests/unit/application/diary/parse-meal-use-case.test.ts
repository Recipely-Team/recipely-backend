import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ParseMealUseCase, type ParseMealInput } from '@application/diary/use-cases/parse-meal-use-case';
import type { DetectedMealItem } from '@application/diary/ports/meal-parser-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { MealParseLimits } from '@application/diary/meal-parse-limits';
import { AYRAN_LOW_FAT_ID, catalogWith, curatedProduct } from '../../fixtures/food-products';

const ayran: DetectedMealItem = {
  label: 'Ayran', searchTerm: 'ayran', grams: 250, confidence: 0.9,
  estimate: { kcal: 90, protein: 4, carbs: 6, fat: 4, fiber: 1 },
};
const menemen: DetectedMealItem = {
  label: 'Menemen', searchTerm: 'menemen', grams: 300, confidence: 0.7,
  estimate: { kcal: 330, protein: 15, carbs: 12, fat: 24, fiber: 3 },
};
const approved: ContentModeratorInterface = { moderate: () => ({ status: ModerationStatus.Approved }) };
const blocking = (word: string): ContentModeratorInterface => ({
  moderate: ({ text }) =>
    text.includes(word)
      ? { status: ModerationStatus.Rejected, hit: { category: 'profanity', term: word } }
      : { status: ModerationStatus.Approved },
});

function build(overrides: { items?: DetectedMealItem[]; used?: number; content?: ContentModeratorInterface; image?: 'ok' | 'rejected' | 'down'; catalog?: ReturnType<typeof catalogWith> } = {}) {
  const parser = { parse: jest.fn().mockResolvedValue(ok(overrides.items ?? [ayran])) };
  const usage = { consume: jest.fn().mockResolvedValue(ok(overrides.used ?? 1)) };
  const image = overrides.image ?? 'ok';
  const imageModerator = {
    moderate: jest.fn().mockResolvedValue(
      image === 'down'
        ? fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'))
        : ok(image === 'ok' ? { status: ModerationStatus.Approved } : { status: ModerationStatus.Rejected, reason: 'x' }),
    ),
  };
  const photos = { prepare: jest.fn(async (bytes: Buffer) => ok({ image: bytes, mimeType: 'image/jpeg' })) };
  const uc = new ParseMealUseCase(
    parser,
    overrides.catalog ?? catalogWith(curatedProduct()),
    usage,
    overrides.content ?? approved,
    imageModerator,
    photos,
    () => new Date('2026-10-07T21:30:00Z'),
  );
  return { uc, parser, usage, imageModerator, photos };
}

const text = (t: string): ParseMealInput => ({ userId: 'u1', locale: 'tr', text: t });
const photo: ParseMealInput = { userId: 'u1', locale: 'tr', photo: { bytes: Buffer.from('jpg'), mimeType: 'image/jpeg' } };

const keyOf = (r: { ok: boolean; failure?: { messageKey: string } }): string | undefined => r.failure?.messageKey;

describe('ParseMealUseCase', () => {
  it('takes nutrients from the catalogue for a matched item, scaled to the portion', async () => {
    const { uc, parser } = build();
    const result = await uc.execute(text('2 bardak ayran'));
    expect(result).toEqual(ok({
      items: [{
        label: 'Ayran', grams: 250, confidence: 0.9, estimated: false,
        match: { kind: 'food', id: AYRAN_LOW_FAT_ID, name: 'Ayran, Az yağlı' },
        nutrientsPerPortion: { kcal: 70, protein: 4.5, carbs: 6.5, fat: 2.5, fiber: 0 },
      }],
    }));
    expect(parser.parse).toHaveBeenCalledWith({ input: { text: '2 bardak ayran' }, locale: 'tr' });
  });

  it("falls back to the model's estimate, flagged, when the catalogue has no match", async () => {
    const { uc } = build({ items: [menemen], catalog: catalogWith() });
    const result = await uc.execute(text('menemen'));
    expect(result).toEqual(ok({
      items: [{ label: 'Menemen', grams: 300, confidence: 0.7, estimated: true, match: { kind: 'none' }, nutrientsPerPortion: menemen.estimate }],
      note: 'some_estimated',
    }));
  });

  it('uses the estimate for a nutrient the catalogue leaves unknown', async () => {
    const product = curatedProduct({ per100: { calories: 28, protein: null, carbs: 2.6, fat: 1, fiber: null, sugar: null, salt: null } });
    const { uc } = build({ catalog: catalogWith(product) });
    const result = await uc.execute(text('ayran'));
    expect(result.ok && result.value.items[0]?.nutrientsPerPortion).toEqual({ kcal: 70, protein: 4, carbs: 6.5, fat: 2.5, fiber: 1 });
  });

  it('notes an empty plate', async () => {
    const { uc } = build({ items: [] });
    expect(await uc.execute(text('su'))).toEqual(ok({ items: [], note: 'nothing_detected' }));
  });

  it('refuses past the daily quota with its own key, before any model call', async () => {
    const { uc, parser, imageModerator, usage } = build({ used: MealParseLimits.dailyPerUser + 1 });
    const result = await uc.execute(photo);
    expect(keyOf(result)).toBe('errors.meal_parse.quota_exceeded');
    expect(!result.ok && result.failure.code).toBe('too_many_requests');
    expect(usage.consume).toHaveBeenCalledWith('u1', new Date('2026-10-07T00:00:00Z'));
    expect(parser.parse).not.toHaveBeenCalled();
    expect(imageModerator.moderate).not.toHaveBeenCalled();
  });

  it('allows the last parse of the day', async () => {
    const { uc } = build({ used: MealParseLimits.dailyPerUser });
    expect((await uc.execute(text('ayran'))).ok).toBe(true);
  });

  it.each([
    ['neither text nor photo', { userId: 'u1', locale: 'tr' }, 'errors.meal_parse.input_required'],
    ['blank text', text('   '), 'errors.meal_parse.input_required'],
    ['both text and photo', { ...photo, text: 'ayran' }, 'errors.meal_parse.input_required'],
    ['text over the limit', text('a'.repeat(MealParseLimits.maxTextChars + 1)), 'errors.meal_parse.text_too_long'],
    ['a PDF as the photo', { ...photo, photo: { bytes: Buffer.from('x'), mimeType: 'application/pdf' } }, 'errors.meal_parse.unsupported_photo'],
  ])('refuses %s without spending quota', async (_name, input, key) => {
    const { uc, usage } = build();
    expect(keyOf(await uc.execute(input as ParseMealInput))).toBe(key);
    expect(usage.consume).not.toHaveBeenCalled();
  });

  it('refuses text the content moderator blocks, before quota or model', async () => {
    const { uc, usage, parser } = build({ content: blocking('badword') });
    expect(keyOf(await uc.execute(text('badword ve ekmek')))).toBe('errors.validation.content_blocked');
    expect(usage.consume).not.toHaveBeenCalled();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('drops an item whose model-written label the moderator blocks', async () => {
    const { uc } = build({ items: [{ ...menemen, label: 'badword' }, ayran], content: blocking('badword') });
    const result = await uc.execute(text('ayran'));
    expect(result.ok && result.value.items.map((i) => i.label)).toEqual(['Ayran']);
  });

  it('moderates the prepared photo and parses the same bytes', async () => {
    const { uc, parser, imageModerator } = build();
    expect((await uc.execute(photo)).ok).toBe(true);
    expect(imageModerator.moderate).toHaveBeenCalledWith({ image: Buffer.from('jpg'), mimeType: 'image/jpeg' });
    expect(parser.parse).toHaveBeenCalledWith({ input: { photo: { image: Buffer.from('jpg'), mimeType: 'image/jpeg' } }, locale: 'tr' });
  });

  it('refuses a photo the image moderator rejects, and one it could not check', async () => {
    const rejected = build({ image: 'rejected' });
    expect(keyOf(await rejected.uc.execute(photo))).toBe('errors.meal_parse.photo_rejected');
    expect(rejected.parser.parse).not.toHaveBeenCalled();
    const down = build({ image: 'down' });
    expect(keyOf(await down.uc.execute(photo))).toBe('errors.meal_parse.photo_unchecked');
    expect(down.parser.parse).not.toHaveBeenCalled();
  });

  it("passes the parser's failure through", async () => {
    const { uc, parser } = build();
    parser.parse.mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable')));
    expect(keyOf(await uc.execute(text('ayran')))).toBe('errors.meal_parse.unavailable');
  });
});
