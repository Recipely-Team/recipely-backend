import fs from 'node:fs';
import path from 'node:path';
import { CuratedRecipeFileSchema } from '@presentation/validators/curated-recipe.validators';

const read = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'fixtures', 'curated', name), 'utf8'));

describe('CuratedRecipeFileSchema', () => {
  it.each(['mercimek-corbasi.json', 'menemen.json'])('accepts the fixture %s, defaulting reviewed and aiWritten', (name) => {
    const parsed = CuratedRecipeFileSchema.parse(read(name));
    expect(parsed).toMatchObject({ reviewed: false, aiWritten: true, nutrition: { source: 'USDA_FDC' } });
  });

  it('refuses a misspelt key rather than dropping it', () => {
    const file = { ...read('menemen.json'), servigns: 2 };
    expect(CuratedRecipeFileSchema.safeParse(file).success).toBe(false);
  });

  it.each([
    ['a slug with spaces', { slug: 'Menemen Tarifi' }],
    ['an unknown category', { category: 'SOUPS' }],
    ['a name without English', { name: { tr: 'Menemen' } }],
    ['no steps in one language', { steps: { tr: ['Pişirin.'], en: [] } }],
  ])('refuses %s', (_what, change) => {
    expect(CuratedRecipeFileSchema.safeParse({ ...read('menemen.json'), ...change }).success).toBe(false);
  });

  it('lets a missing fdcId through to the quality gate, which reports it', () => {
    const file = read('menemen.json') as { ingredients: Record<string, unknown>[] };
    delete file.ingredients[0]?.['fdcId'];
    expect(CuratedRecipeFileSchema.safeParse(file).success).toBe(true);
  });

  // The import reads the file this names, so anything but a bare name beside
  // the JSON would let a dataset file read arbitrary files off the host.
  it.each(['../secrets.jpg', '/etc/passwd', 'sub/menemen.jpg', '..\\menemen.jpg', 'menemen.gif', 'menemen', '.jpg', 'men emen.jpg'])(
    'refuses the photo file name %p',
    (name) => {
      const file = read('menemen.json') as { image: Record<string, unknown> };
      file.image['file'] = name;
      expect(CuratedRecipeFileSchema.safeParse(file).success).toBe(false);
    },
  );

  it.each(['menemen.jpg', 'Menemen_2.JPEG', 'a-b.png', 'x.webp'])('accepts the bare photo file name %p', (name) => {
    const file = read('menemen.json') as { image: Record<string, unknown> };
    file.image['file'] = name;
    expect(CuratedRecipeFileSchema.safeParse(file).success).toBe(true);
  });
});
