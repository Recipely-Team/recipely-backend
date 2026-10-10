import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { FridgeDiet } from '@domain/fridge/fridge-diet';
import { Difficulty } from '@domain/recipes/difficulty';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import type { DetectedIngredient } from '@application/fridge/ports/fridge-scanner-interface';
import type { SuggestedIdea } from '@application/fridge/ports/fridge-idea-generator-interface';
import { ScanFridgeUseCase, type ScanFridgeInput } from '@application/fridge/use-cases/scan-fridge-use-case';
import { SuggestFridgeIdeasUseCase, type SuggestFridgeIdeasInput } from '@application/fridge/use-cases/suggest-fridge-ideas-use-case';
import { FridgeLimits } from '@application/fridge/fridge-limits';

const approved: ContentModeratorInterface = { moderate: () => ({ status: ModerationStatus.Approved }) };
const blocking = (word: string): ContentModeratorInterface => ({
  moderate: ({ text }) =>
    text.toLowerCase().includes(word)
      ? { status: ModerationStatus.Rejected, hit: { category: 'profanity', term: word } }
      : { status: ModerationStatus.Approved },
});
const usageAt = (count: number) => ({ consume: jest.fn().mockResolvedValue(ok(count)), refund: jest.fn().mockResolvedValue(undefined) });
const keyOf = (r: { ok: boolean; failure?: { messageKey: string } }): string | undefined => r.failure?.messageKey;
const NOW = () => new Date('2026-10-11T09:00:00Z');

describe('ScanFridgeUseCase', () => {
  const jpg = { bytes: Buffer.from('jpg'), mimeType: 'image/jpeg' };
  const scanInput = (photos: ScanFridgeInput['photos'] = [jpg]): ScanFridgeInput => ({ userId: 'u1', locale: 'tr', photos });

  function build(o: { found?: DetectedIngredient[]; used?: number; content?: ContentModeratorInterface; image?: 'ok' | 'rejected' | 'down'; decodes?: boolean } = {}) {
    const scanner = { scan: jest.fn().mockResolvedValue(ok(o.found ?? [{ name: 'Yumurta', confidence: 'high' }])) };
    const usage = usageAt(o.used ?? 1);
    const image = o.image ?? 'ok';
    const imageModerator = {
      moderate: jest.fn().mockResolvedValue(
        image === 'down'
          ? fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'))
          : ok(image === 'ok' ? { status: ModerationStatus.Approved } : { status: ModerationStatus.Rejected, reason: 'x' }),
      ),
    };
    const photos = {
      prepare: jest.fn(async (bytes: Buffer) =>
        o.decodes === false ? fail(new UnprocessableFailure('errors.meal_parse.unsupported_photo')) : ok({ image: bytes, mimeType: 'image/jpeg' })),
    };
    const uc = new ScanFridgeUseCase(scanner, usage, o.content ?? approved, imageModerator, photos, NOW);
    return { uc, scanner, usage, imageModerator };
  }

  it('answers cleaned, deduplicated names; a high duplicate wins; flagged names are dropped', async () => {
    const { uc, scanner } = build({
      content: blocking('kötü'),
      found: [
        { name: '  Domates ', confidence: 'low' },
        { name: 'domates', confidence: 'high' },
        { name: 'KÖTÜ şey', confidence: 'high' },
        { name: 'Süt', confidence: 'low' },
      ],
    });
    const result = await uc.execute(scanInput([jpg, jpg]));
    expect(result).toEqual(ok({ ingredients: [{ name: 'domates', confidence: 'high' }, { name: 'süt', confidence: 'low' }] }));
    expect(scanner.scan).toHaveBeenCalledWith({ photos: [expect.anything(), expect.anything()], locale: 'tr' });
  });

  it(`keeps at most ${FridgeLimits.maxScanIngredients} ingredients`, async () => {
    const found = Array.from({ length: 40 }, (_, i) => ({ name: `item ${i}`, confidence: 'high' as const }));
    const result = await build({ found }).uc.execute(scanInput());
    expect(result.ok && result.value.ingredients).toHaveLength(FridgeLimits.maxScanIngredients);
  });

  it('refuses no photo, four photos and an undeclared type before spending anything', async () => {
    const { uc, usage } = build();
    expect(keyOf(await uc.execute(scanInput([])))).toBe('errors.fridge.no_photos');
    expect(keyOf(await uc.execute(scanInput([jpg, jpg, jpg, jpg])))).toBe('errors.fridge.too_many_photos');
    expect(keyOf(await uc.execute(scanInput([{ bytes: Buffer.from('x'), mimeType: 'application/pdf' }])))).toBe('errors.fridge.unsupported_photo');
    expect(usage.consume).not.toHaveBeenCalled();
  });

  it('answers 429 past the daily allowance without calling a model', async () => {
    const { uc, scanner, imageModerator } = build({ used: FridgeLimits.dailyPerUser + 1 });
    const result = await uc.execute(scanInput());
    expect(!result.ok && [result.failure.code, result.failure.messageKey]).toEqual(['too_many_requests', 'errors.fridge.quota_exceeded']);
    expect(imageModerator.moderate).not.toHaveBeenCalled();
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('a rejected photo keeps the attempt; an unreachable moderator and an undecodable photo refund it', async () => {
    const rejected = build({ image: 'rejected' });
    expect(keyOf(await rejected.uc.execute(scanInput()))).toBe('errors.fridge.photo_rejected');
    expect(rejected.usage.refund).not.toHaveBeenCalled();

    const down = build({ image: 'down' });
    expect(keyOf(await down.uc.execute(scanInput()))).toBe('errors.fridge.photo_unchecked');
    expect(down.usage.refund).toHaveBeenCalledTimes(1);
    expect(down.scanner.scan).not.toHaveBeenCalled();

    const garbled = build({ decodes: false });
    expect(keyOf(await garbled.uc.execute(scanInput()))).toBe('errors.fridge.unsupported_photo');
    expect(garbled.usage.refund).toHaveBeenCalledTimes(1);
  });

  it('refunds a scanner outage, but not a scan that found nothing (422)', async () => {
    const outage = build();
    outage.scanner.scan.mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.fridge.unavailable')));
    expect(keyOf(await outage.uc.execute(scanInput()))).toBe('errors.fridge.unavailable');
    expect(outage.usage.refund).toHaveBeenCalledTimes(1);

    const empty = build({ found: [] });
    const result = await empty.uc.execute(scanInput());
    expect(!result.ok && [result.failure.code, result.failure.messageKey]).toEqual(['unprocessable', 'errors.fridge.nothing_recognised']);
    expect(empty.usage.refund).not.toHaveBeenCalled();
  });
});

describe('SuggestFridgeIdeasUseCase', () => {
  const idea = (title: string, extra: Partial<SuggestedIdea> = {}): SuggestedIdea => ({
    title, summary: `${title} in 20 minutes.`, totalMinutes: 20, difficulty: Difficulty.Easy,
    uses: ['domates', 'YUMURTA'], missing: ['beyaz peynir', 'tuz', 'Zeytinyağı', 'domates'], ...extra,
  });
  const input = (o: Partial<SuggestFridgeIdeasInput> = {}): SuggestFridgeIdeasInput => ({
    userId: 'u1', ingredients: ['Domates', 'yumurta', 'domates '], maxMinutes: 30, diet: FridgeDiet.Vegetarian,
    servings: 2, exclude: [], locale: 'tr', ...o,
  });

  function build(o: { ideas?: SuggestedIdea[]; used?: number; content?: ContentModeratorInterface } = {}) {
    const generator = { suggest: jest.fn().mockResolvedValue(ok(o.ideas ?? [idea('Menemen'), idea('Shakshuka'), idea('Omlet')])) };
    const usage = usageAt(o.used ?? 1);
    return { uc: new SuggestFridgeIdeasUseCase(generator, usage, o.content ?? approved, NOW), generator, usage };
  }

  it('answers three ideas held to the request: uses from the list, no staples or owned items missing', async () => {
    const { uc, generator } = build();
    const result = await uc.execute(input());
    expect(result.ok && result.value.ideas).toHaveLength(3);
    expect(result.ok && result.value.ideas[0]).toEqual({
      title: 'Menemen', summary: 'Menemen in 20 minutes.', totalMinutes: 20, difficulty: 'EASY',
      uses: ['Domates', 'yumurta'], missing: ['beyaz peynir'],
    });
    expect(generator.suggest).toHaveBeenCalledWith(expect.objectContaining({ ingredients: ['Domates', 'yumurta'], maxMinutes: 30, diet: 'vegetarian' }));
  });

  it('drops ideas over the time limit, repeating an excluded title, or failing the word list', async () => {
    const { uc } = build({
      content: blocking('kötü'),
      ideas: [idea('Slow stew', { totalMinutes: 90 }), idea('Menemen'), idea('Kötü yemek'), idea('Omlet'), idea('Pilav'), idea('Extra')],
    });
    const result = await uc.execute(input({ exclude: ['menemen'] }));
    expect(result.ok && result.value.ideas.map((i) => i.title)).toEqual(['Omlet', 'Pilav', 'Extra']);
  });

  it('refuses a flagged ingredient and an empty list before spending anything', async () => {
    const { uc, usage } = build({ content: blocking('kötü') });
    expect(keyOf(await uc.execute(input({ ingredients: ['kötü'] })))).toBe('errors.validation.content_blocked');
    expect(keyOf(await uc.execute(input({ ingredients: ['  '] })))).toBe('errors.fridge.ingredients_required');
    expect(usage.consume).not.toHaveBeenCalled();
  });

  it('answers 429 past the allowance it shares with the scan', async () => {
    const { uc, generator } = build({ used: FridgeLimits.dailyPerUser + 1 });
    expect(keyOf(await uc.execute(input()))).toBe('errors.fridge.quota_exceeded');
    expect(generator.suggest).not.toHaveBeenCalled();
  });

  it('refunds an outage, and an answer that cleaning left empty', async () => {
    const outage = build();
    outage.generator.suggest.mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.fridge.unavailable')));
    expect(keyOf(await outage.uc.execute(input()))).toBe('errors.fridge.unavailable');
    expect(outage.usage.refund).toHaveBeenCalledTimes(1);

    const tooSlow = build({ ideas: [idea('A', { totalMinutes: 50 })] });
    expect(keyOf(await tooSlow.uc.execute(input()))).toBe('errors.fridge.unavailable');
    expect(tooSlow.usage.refund).toHaveBeenCalledTimes(1);
  });
});
