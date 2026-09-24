import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The symptom: the second cook to import and publish the same reel was told
 * "recipe already exists".
 *
 * `recipes.source_url` carried a GLOBAL unique index from the food.com import,
 * where it made re-running the script an upsert. Once publishing began copying
 * an import's URL onto the recipe, that index handed the reel to whoever
 * published it first. The key is now per owner. There is no database in this
 * suite, so the schema itself is what is asserted — the model the migration
 * and the Prisma client are both generated from.
 */
const schema = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
const recipeModel = /model Recipe \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

describe('recipes.sourceUrl uniqueness', () => {
  it('finds the Recipe model', () => {
    expect(recipeModel).toContain('sourceUrl');
  });

  it('lets two different people publish a recipe imported from the same URL', () => {
    const column = recipeModel.split('\n').find((line) => /^\s*sourceUrl\s/.test(line)) ?? '';
    expect(column).not.toContain('@unique');
  });

  it('still keys a source URL per owner, so the dataset scripts stay idempotent', () => {
    expect(recipeModel).toMatch(/@@unique\(\[ownerId, sourceUrl\]\)/);
  });
});
