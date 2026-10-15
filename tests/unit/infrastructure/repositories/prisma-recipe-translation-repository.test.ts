import type { PrismaClient } from '@prisma/client';
import { PrismaRecipeTranslationRepository } from '@infrastructure/repositories/recipes/prisma-recipe-translation-repository';

const text = { name: 'Eggs', ingredients: ['3 eggs'], instructions: ['Cook.'], tags: ['quick'], mealType: ['breakfast'], tips: [] };

const withRow = (row: Record<string, unknown>) => {
  const update = jest.fn();
  const tx = { recipe: { findFirst: jest.fn(async () => row), update } };
  const prisma = { $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) } as unknown as PrismaClient;
  return { repo: new PrismaRecipeTranslationRepository(prisma), update };
};

describe('PrismaRecipeTranslationRepository.setTranslations', () => {
  it('adds a missing language and never overwrites one the author wrote', async () => {
    const { repo, update } = withRow({ name: { tr: 'Menemen', en: 'Author’s eggs' }, ingredients: { tr: ['yumurta'] }, instructions: { tr: ['pişir'] }, tags: {}, mealType: {}, tips: null });
    await repo.setTranslations('r1', { en: text, de: { ...text, name: 'Eier' } });
    const data = update.mock.calls[0][0].data;
    expect(data.name).toEqual({ tr: 'Menemen', en: 'Author’s eggs', de: 'Eier' });
    expect(data.ingredients).toEqual({ tr: ['yumurta'], en: ['3 eggs'], de: ['3 eggs'] });
    expect(data.tips).toBeUndefined();
  });

  // meal_type defaulted to [] on older rows; a map would drop what it holds.
  it('leaves a column that is not a language map alone', async () => {
    const { repo, update } = withRow({ name: { tr: 'Menemen' }, ingredients: { tr: [] }, instructions: { tr: [] }, tags: {}, mealType: ['breakfast'], tips: null });
    await repo.setTranslations('r1', { en: text });
    expect(update.mock.calls[0][0].data.mealType).toBeUndefined();
  });
});

describe('PrismaRecipeTranslationRepository.listNeedingTranslation', () => {
  it('asks for live recipes missing any of the given languages, published first', async () => {
    const queryRaw = jest.fn(async () => []);
    const repo = new PrismaRecipeTranslationRepository({ $queryRaw: queryRaw } as unknown as PrismaClient);
    await repo.listNeedingTranslation(2, ['en', 'tr']);
    const [strings, ...values] = queryRaw.mock.calls[0] as unknown as [readonly string[], ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/NOT \(name::jsonb \?& \?::text\[\]\)/);
    expect(sql).toMatch(/ORDER BY is_published DESC, random\(\)/);
    expect(values).toContainEqual(['en', 'tr']);
  });
});
