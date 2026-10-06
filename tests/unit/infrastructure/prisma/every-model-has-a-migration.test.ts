import { readFileSync, readdirSync } from 'fs';
import path from 'path';

// The FeatureFlag model shipped with no migration: the client compiled, every
// gate was green, and the table simply did not exist — the admin panel's
// Feature Flag tab failed on open in dev and prod alike. Prisma never checks
// that a model has a table until a query runs, so this does.
describe('prisma schema', () => {
  const root = path.join(__dirname, '../../../../prisma');
  const schema = readFileSync(path.join(root, 'schema.prisma'), 'utf8');
  const migrationsDir = path.join(root, 'migrations');
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(path.join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
    .join('\n');

  // One block per model, cut at its closing brace, so a model without @@map
  // can never borrow the next model's table name.
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  const tables = models.map(([, name, body]) => body?.match(/@@map\("(\w+)"\)/)?.[1] ?? name);

  it('finds the mapped tables', () => {
    expect(tables.length).toBeGreaterThan(30);
  });

  it.each(tables)('creates table %s in some migration', (table) => {
    expect(migrations).toMatch(new RegExp(`CREATE TABLE (IF NOT EXISTS )?"${table}"`));
  });
});
