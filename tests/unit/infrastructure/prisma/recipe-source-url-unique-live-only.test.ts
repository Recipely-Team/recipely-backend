import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The symptom: import a recipe from a link, save it, delete it, import the
 * same link again — saving now fails with "Bu bağlantıdan oluşturulmuş bir
 * tarif zaten var" ("a recipe from this link already exists"), forever. Seen
 * live on dev with yemek.com/tarif/trilece. Deleting a recipe is a soft delete,
 * and the (owner_id, source_url) unique index still counted the tombstone.
 *
 * There is no database in this suite, so the migrations are read in order and
 * the index as they leave it is what is asserted.
 */
const root = join(__dirname, '../../../..');
const migrations = join(root, 'prisma/migrations');
const sql = readdirSync(migrations)
  .filter((d) => /^\d{14}_/.test(d))
  .sort()
  .map((d) => readFileSync(join(migrations, d, 'migration.sql'), 'utf8'))
  .join('\n');

/** Every statement that creates an index over (owner_id, source_url), in migration order. */
const definitions = [...sql.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX[^;]*"recipes"\s*\(\s*"owner_id"\s*,\s*"source_url"\s*\)[^;]*;/gi)].map((m) => m[0]);

describe('recipes (owner, source URL) uniqueness', () => {
  it('lets a deleted recipe’s link be imported and saved again by the same owner', () => {
    const current = definitions[definitions.length - 1] ?? '';

    expect(current).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(current).toMatch(/WHERE\s+"deleted_at"\s+IS\s+NULL/i);
  });

  it('is not declared as a plain @@unique in the Prisma model, which would put the full index back', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');

    expect(schema).not.toMatch(/@@unique\(\[ownerId,\s*sourceUrl\]\)/);
  });
});
