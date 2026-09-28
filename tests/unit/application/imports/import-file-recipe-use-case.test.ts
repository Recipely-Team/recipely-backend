import sharp from 'sharp';
import { ok, fail } from '@core/result/result';
import { UnprocessableFailure } from '@core/failure';
import { ImportFileRecipeUseCase } from '@application/imports/use-cases/import-file-recipe-use-case';
import { ModelFileRecipeReader } from '@infrastructure/ai/import/model-file-recipe-reader';
import type { FileRecipeReaderInterface } from '@application/ai/ports/file-recipe-reader-interface';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';

const recipe = {
  title: 'Anneannemin kurabiyesi', cuisine: 'TURKISH', category: 'DESSERT', difficulty: 'EASY',
  prepTimeMinutes: 20, cookTimeMinutes: 15, servings: 12, ingredients: ['250 g tereyağı'], instructions: ['Yoğur.'],
  tags: [], mealType: [], tips: [], caloriesPerServing: 0, nutrition: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
} as const;
const img = (n = 1) => Array.from({ length: n }, () => ({ mimeType: 'image/jpeg', bytes: Buffer.from('x') }));
const pdf = { mimeType: 'application/pdf', bytes: Buffer.from('%PDF') };

const setup = () => {
  const reader = { read: jest.fn(async () => ok(recipe)) } as unknown as FileRecipeReaderInterface & { read: jest.Mock };
  const drafts = { upsert: jest.fn(async (d: { id: string }) => ok(d)) } as unknown as RecipeDraftRepositoryInterface & { upsert: jest.Mock };
  return { reader, drafts, useCase: new ImportFileRecipeUseCase(reader, drafts) };
};

describe('importing a recipe from a file', () => {
  it('reads photos into a private, AI-marked draft the editor opens', async () => {
    const { useCase, drafts } = setup();
    const r = await useCase.execute({ ownerId: 'u1', locale: 'tr', files: img(3) });

    expect(r.ok).toBe(true);
    const snapshot = drafts.upsert.mock.calls[0][0].snapshot;
    expect(snapshot.name).toBe('Anneannemin kurabiyesi');
    expect(snapshot.aiWritten).toBe(true);
    expect(snapshot.origin).toBe('AI');
    expect(snapshot.image).toBe('');
  });

  it.each([
    ['nothing at all', [], 'errors.import.no_file'],
    ['six photos', img(6), 'errors.import.too_many_files'],
    ['two PDFs', [pdf, pdf], 'errors.import.too_many_files'],
    ['a PDF with photos', [pdf, ...img(1)], 'errors.import.too_many_files'],
    ['a text file', [{ mimeType: 'text/plain', bytes: Buffer.from('x') }], 'errors.import.unsupported_file'],
  ])('refuses %s before any reading', async (_why, files, key) => {
    const { useCase, reader } = setup();
    const r = await useCase.execute({ ownerId: 'u1', locale: 'tr', files: files as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe(key);
    expect(reader.read).not.toHaveBeenCalled();
  });
});

describe('ModelFileRecipeReader', () => {
  const model = (answer: 'ok' | 'none' | 'down') =>
    ({
      provider: answer, frameBudget: 3, canRun: () => true,
      transcribe: jest.fn(),
      extract: jest.fn(async () =>
        answer === 'ok' ? ok({ recipe, modelUsed: 'm', provider: 'p', coverFrameJpegBase64: null })
          : fail(new UnprocessableFailure(answer === 'none' ? 'errors.import.no_recipe_found' : 'errors.ai.upstream_failed'))),
    }) as unknown as ImportModelInterface & { extract: jest.Mock };
  const photo = async () => ({ mimeType: 'image/png', bytes: await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } }).png().toBuffer() });

  it('hands pages to the model as ordered JPEG frames, telling it they are pages', async () => {
    const m = model('ok');
    const r = await new ModelFileRecipeReader([m]).read({ files: [await photo(), await photo()], locale: 'tr' });
    expect(r.ok).toBe(true);
    const [caption, , frames] = m.extract.mock.calls[0];
    expect(caption).toMatch(/written recipe/);
    expect(frames).toHaveLength(2);
  });

  it('tries the next provider when one is down, but stops at "no recipe"', async () => {
    const down = model('down'); const none = model('none'); const never = model('ok');
    const r = await new ModelFileRecipeReader([down, none, never]).read({ files: [await photo()], locale: 'tr' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.no_recipe_in_file');
    expect(never.extract).not.toHaveBeenCalled();
  });

  it('says a broken PDF could not be opened', async () => {
    const r = await new ModelFileRecipeReader([model('ok')]).read({ files: [{ mimeType: 'application/pdf', bytes: Buffer.from('not a pdf') }], locale: 'tr' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.unreadable_file');
  });
});

it('turns a third concurrent reading away as busy rather than decoding it', async () => {
  const releases: Array<() => void> = [];
  const slow = {
    provider: 'p', frameBudget: 3, canRun: () => true, transcribe: jest.fn(),
    extract: jest.fn(() => new Promise((resolve) => { releases.push(() => resolve(ok({ recipe, modelUsed: 'm', provider: 'p', coverFrameJpegBase64: null }))); })),
  } as unknown as ImportModelInterface;
  const reader = new ModelFileRecipeReader([slow]);
  const one = { mimeType: 'image/png', bytes: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer() };
  const a = reader.read({ files: [one], locale: 'tr' });
  const b = reader.read({ files: [one], locale: 'tr' });
  await new Promise((r) => setTimeout(r, 50));
  const c = await reader.read({ files: [one], locale: 'tr' });
  expect(c.ok).toBe(false);
  if (!c.ok) expect(c.failure.messageKey).toBe('errors.import.busy');
  releases.forEach((r) => r());
  await Promise.allSettled([a, b]);
});
