import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaFoodCatalogRepository } from '@infrastructure/repositories/foods/prisma-food-catalog-repository';
import type { FoodVariantRow } from '@infrastructure/prisma/mappers/food-variant.row-mapper';

const row = (overrides: Partial<FoodVariantRow> = {}): FoodVariantRow => ({
  variantId: 'v1', variantNames: { en: 'Low-fat', tr: 'Az yağlı' }, variantCount: 3,
  kcal: 26, protein: 1.9, carbs: 2.6, fat: 0.9, fiber: 0, sugar: 2.6, salt: 0.6,
  servingUnits: [{ key: 'glass', amount: 200 }], foodId: 'f1', category: 'dairy',
  foodNames: { en: 'Ayran', tr: 'Ayran' }, defaultUnit: 'ml', ...overrides,
});

/** The statements a search ran, as Postgres text with their values. */
async function searched(query: Parameters<PrismaFoodCatalogRepository['search']>[0], rows = [row()], total = 1) {
  const calls: Prisma.Sql[] = [];
  const queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(Prisma.sql(strings, ...values));
    return calls.length % 2 === 1 ? rows : [{ total }];
  });
  const prisma = { $queryRaw: queryRaw, $transaction: (ops: unknown[]) => Promise.all(ops) } as unknown as PrismaClient;
  const result = await new PrismaFoodCatalogRepository(prisma).search(query);
  const text = (sql: Prisma.Sql | undefined) => (sql?.text ?? '').replace(/\s+/g, ' ');
  return { result, page: text(calls[0]), count: text(calls[1]), values: calls[0]?.values ?? [] };
}

describe('PrismaFoodCatalogRepository.search', () => {
  it('requires every word, folded, against food + variant name in one locale', async () => {
    const { page, count, values } = await searched({ term: 'Ayran AZ', page: 1, pageSize: 10 });
    expect(page).toContain("FROM jsonb_each_text(f.names) AS named(locale, title)");
    expect(page).toContain("(named.title || ' ' || COALESCE(v.names ->> named.locale, ''))");
    expect(page.match(/LIKE translate\(lower\(translate\(\$\d+/g)).toHaveLength(3); // two words + the prefix order
    expect(values).toEqual(expect.arrayContaining(['%Ayran%', '%AZ%', 'Ayran AZ%']));
    expect(count).toContain('WHERE EXISTS');
  });

  it('orders by a name prefix first, then catalogue rank, position and id', async () => {
    const { page } = await searched({ term: 'ayran', page: 1, pageSize: 10 });
    expect(page).toMatch(/ORDER BY EXISTS \(.*\) DESC, f\.rank ASC, v\.position ASC, v\.id ASC/);
  });

  it('browses without a term, by category, paged by offset', async () => {
    const { page, count, values } = await searched({ category: 'drinks', page: 3, pageSize: 20 });
    expect(page).toContain('WHERE f.category = $1');
    expect(page).not.toContain('jsonb_each_text');
    expect(page).toMatch(/ORDER BY f\.rank ASC/);
    expect(values.slice(-2)).toEqual([20, 40]);
    expect(count).toContain('WHERE f.category = $1');
  });

  it('lists everything with neither', async () => {
    const { page } = await searched({ page: 1, pageSize: 20 });
    expect(page).toContain('FROM food_variants v JOIN foods f ON f.id = v.food_id ORDER BY');
  });

  it('answers the page envelope and drops a row it cannot read', async () => {
    const { result } = await searched({ page: 1, pageSize: 20 }, [row(), row({ variantId: 'bad', defaultUnit: 'cup' })], 2);
    expect(result.ok && { ids: result.value.items.map((p) => p.foodVariantId), total: result.value.total }).toEqual({ ids: ['v1'], total: 2 });
  });

  it('escapes LIKE wildcards in the term', async () => {
    const { values } = await searched({ term: '100%', page: 1, pageSize: 10 });
    expect(values).toEqual(expect.arrayContaining(['%100\\%%']));
  });

  it('reports a database error as a failure', async () => {
    const prisma = { $queryRaw: jest.fn(), $transaction: jest.fn().mockRejectedValue(new Error('down')) } as unknown as PrismaClient;
    expect((await new PrismaFoodCatalogRepository(prisma).search({ page: 1, pageSize: 1 })).ok).toBe(false);
  });
});

describe('PrismaFoodCatalogRepository.findFood', () => {
  it('reads the food with every variant in position order', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'f1', category: 'dairy', names: { en: 'Ayran' }, defaultUnit: 'ml',
      variants: [{ id: 'v1', names: { en: 'Regular' }, kcal: 36, protein: 1.7, carbs: 2.5, fat: 1.9, fiber: 0, sugar: 2.5, salt: 0.6, servingUnits: [{ key: 'glass', amount: 200 }, { key: 'bowl', amount: 300 }] }],
    });
    const prisma = { food: { findUnique } } as unknown as PrismaClient;
    const result = await new PrismaFoodCatalogRepository(prisma).findFood('f1');
    expect(findUnique.mock.calls[0][0].include.variants.orderBy).toEqual([{ position: 'asc' }, { id: 'asc' }]);
    expect(result.ok && result.value).toMatchObject({
      source: 'curated', foodId: 'f1', defaultUnit: 'ml',
      variants: [{ foodVariantId: 'v1', names: { en: 'Regular' }, per100: { calories: 36 }, servingUnits: [{ key: 'glass', amount: 200 }] }],
    });
  });

  it('answers null for no such food', async () => {
    const prisma = { food: { findUnique: jest.fn().mockResolvedValue(null) } } as unknown as PrismaClient;
    expect(await new PrismaFoodCatalogRepository(prisma).findFood('f9')).toEqual({ ok: true, value: null });
  });
});

describe('PrismaFoodCatalogRepository.listCategories', () => {
  it('pages the shelves in rank order with their food counts', async () => {
    const findMany = jest.fn().mockResolvedValue([{ key: 'dairy', names: { en: 'Dairy' }, rank: 0, _count: { foods: 20 } }]);
    const prisma = {
      foodCategory: { findMany, count: jest.fn().mockResolvedValue(16) },
      $transaction: (ops: unknown[]) => Promise.all(ops),
    } as unknown as PrismaClient;
    const result = await new PrismaFoodCatalogRepository(prisma).listCategories(2, 5);
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 5, take: 5, orderBy: [{ rank: 'asc' }, { key: 'asc' }] });
    expect(result).toEqual({ ok: true, value: { items: [{ key: 'dairy', names: { en: 'Dairy' }, productCount: 20 }], total: 16, page: 2, pageSize: 5 } });
  });
});

describe('serving units read from the catalogue', () => {
  it('keeps a portion and drops a key the code does not know', async () => {
    const { servingUnitsFromJson } = await import('@infrastructure/prisma/mappers/food-variant.row-mapper');
    expect(servingUnitsFromJson([{ key: 'portion', amount: 250 }, { key: 'bowl', amount: 300 }])).toEqual([{ key: 'portion', amount: 250 }]);
  });
});
