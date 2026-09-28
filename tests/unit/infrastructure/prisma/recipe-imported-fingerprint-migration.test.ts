import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The copyright gate reads three nullable columns. There is no database in this
 * suite, so the schema and the migration that ships them are what is asserted:
 * a column in the Prisma model with no migration behind it fails on the first
 * deploy, not here.
 */
const root = join(__dirname, '../../../..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const recipeModel = /model Recipe \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
const migrations = join(root, 'prisma/migrations');
const migrationSql = readdirSync(migrations)
  .filter((d) => d.endsWith('_recipe_imported_fingerprint'))
  .map((d) => readFileSync(join(migrations, d, 'migration.sql'), 'utf8'))
  .join('\n');

describe('recipes imported fingerprint columns', () => {
  it.each([
    ['importedImage', 'imported_image'],
    ['importedIngredientsHash', 'imported_ingredients_hash'],
    ['importedInstructionsHash', 'imported_instructions_hash'],
  ])('%s is a nullable column with a migration', (field, column) => {
    expect(recipeModel).toMatch(new RegExp(`\\n\\s*${field}\\s+String\\?\\s+@map\\("${column}"\\)`));
    expect(migrationSql).toContain(`ADD COLUMN "${column}" TEXT;`);
  });

  it('is additive: nothing dropped, nothing made NOT NULL', () => {
    expect(migrationSql).not.toMatch(/DROP|NOT NULL/i);
  });
});
