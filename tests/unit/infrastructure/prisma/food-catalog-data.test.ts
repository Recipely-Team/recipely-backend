import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The curated catalogue is data (prisma/food-catalog/) turned into a migration
 * by scripts/generate-food-catalog-migration.mjs. `--check` validates every
 * food — 14 names, known serving keys, labelled variants, energy that follows
 * from its macros (4/4/9 kcal per g, ±15 %), no more than 100 g per 100 g — and
 * that the newest generated migration is exactly what the catalogue renders,
 * so an edit to the data cannot ship without the migration that applies it.
 */
const root = join(__dirname, '../../../..');
const catalog = join(root, 'prisma', 'food-catalog');

describe('food catalogue data', () => {
  it('is valid and its migration is current', () => {
    const out = execFileSync('node', ['scripts/generate-food-catalog-migration.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    expect(out).toContain('food catalogue — OK');
  });

  it('holds a couple of hundred everyday foods across every shelf, ayran and cola among them with their variants', () => {
    const shelves = readdirSync(catalog)
      .filter((f) => /^\d{2}-/.test(f))
      .map((f) => JSON.parse(readFileSync(join(catalog, f), 'utf8')) as { category: string; foods: Array<{ slug: string; variants: unknown[][] }> });
    const foods = shelves.flatMap((s) => s.foods);
    expect(foods.length).toBeGreaterThanOrEqual(200);
    expect(new Set(shelves.map((s) => s.category)).size).toBeGreaterThanOrEqual(15);
    const variants = (slug: string) => foods.find((f) => f.slug === slug)?.variants.map((v) => v[0]);
    expect(variants('ayran')).toEqual(['regular', 'low_fat', 'low_salt']);
    expect(variants('cola')).toEqual(['regular', 'zero_sugar', 'light']);
    expect(variants('bread')).toEqual(expect.arrayContaining(['white', 'whole_wheat', 'rye']));
  });
});
