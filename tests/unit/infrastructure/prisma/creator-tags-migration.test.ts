import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A user may hold an Instagram AND a TikTok creator tag, each reviewed on its
 * own, while one handle on one platform has at most one approved holder. Those
 * rules are the database's (the use cases check first; the indexes close the
 * races), so they are asserted on the migrations as they leave the schema.
 *
 * There is no database in this suite, so the migrations are read in order.
 */
const root = join(__dirname, '../../../..');
const migrations = join(root, 'prisma/migrations');
const dirs = readdirSync(migrations).filter((d) => /^\d{14}_/.test(d)).sort();
const sql = dirs.map((d) => readFileSync(join(migrations, d, 'migration.sql'), 'utf8')).join('\n');
const perPlatform = readFileSync(
  join(migrations, dirs.find((d) => d.endsWith('_creator_tags_per_platform')) ?? 'missing', 'migration.sql'),
  'utf8',
);
const oneLine = (s: string): string => s.replace(/\s+/g, ' ');

describe('creator_tags constraints', () => {
  it('allows one row per (user, platform), so a user holds at most one tag on each platform', () => {
    expect(oneLine(sql)).toMatch(/CREATE UNIQUE INDEX "creator_tags_user_id_platform_key" ON "creator_tags"\("user_id", "platform"\);/);
  });

  it('allows one approved holder per (platform, handle), but any number of pending or rejected claims', () => {
    expect(oneLine(sql)).toMatch(
      /CREATE UNIQUE INDEX "creator_tags_approved_handle_key" ON "creator_tags"\("platform", "handle"\) WHERE "status" = 'approved';/,
    );
  });

  it('removes a user\'s tags with the user row', () => {
    expect(oneLine(sql)).toMatch(/FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE CASCADE/);
  });

  it('is not declared as a plain @@unique on (platform, handle) in the Prisma model, which would forbid pending duplicates', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
    expect(schema).not.toMatch(/@@unique\(\[platform,\s*handle\]\)/);
  });
});

describe('creator_tags_per_platform migration', () => {
  it('copies the live claims across before dropping the users.creator_* columns', () => {
    const copy = perPlatform.indexOf('INSERT INTO "creator_tags"');
    const drop = perPlatform.indexOf('DROP COLUMN "creator_status"');
    expect(copy).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(copy);
    expect(oneLine(perPlatform)).toMatch(/WHERE "creator_status" <> 'none'.*AND "deleted_at" IS NULL;/);
  });

  it('leaves no creator column or index on users', () => {
    for (const column of ['creator_status', 'creator_platform', 'creator_handle', 'creator_requested_at', 'creator_reviewed_at']) {
      expect(perPlatform).toContain(`DROP COLUMN "${column}"`);
    }
    expect(perPlatform).toContain('DROP INDEX "users_creator_approved_handle_key"');
    expect(perPlatform).toContain('DROP INDEX "users_creator_status_idx"');
  });
});
