import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The rules the Instagram tables enforce themselves: one private reply per
 * comment ever (a redelivered webhook must not DM twice), one link per user
 * and per Instagram account, and nothing of a user's left after their row goes.
 */
const migrations = join(__dirname, '../../../../prisma/migrations');
const sql = readdirSync(migrations)
  .filter((d) => /^\d{14}_/.test(d))
  .sort()
  .map((d) => readFileSync(join(migrations, d, 'migration.sql'), 'utf8'))
  .join('\n')
  .replace(/\s+/g, ' ');

describe('instagram automations constraints', () => {
  it.each([
    ['one send per comment', 'CREATE UNIQUE INDEX "dm_sends_comment_id_key" ON "dm_sends"("comment_id");'],
    ['one link per user', 'CREATE UNIQUE INDEX "instagram_connections_user_id_key" ON "instagram_connections"("user_id");'],
    ['one link per Instagram account', 'CREATE UNIQUE INDEX "instagram_connections_ig_user_id_key" ON "instagram_connections"("ig_user_id");'],
    ['links go with the user', 'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE'],
    ['sends go with their rule', '"dm_sends_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "dm_rules"("id") ON DELETE CASCADE'],
    ['the queue is claimed by status and due time', 'CREATE INDEX "instagram_events_status_available_at_idx" ON "instagram_events"("status", "available_at");'],
  ])('%s', (_label, statement) => {
    expect(sql).toContain(statement);
  });

  it('keeps the token column encrypted by name, never a plain access_token column', () => {
    expect(sql).toContain('"access_token_enc" TEXT NOT NULL');
    expect(sql).not.toMatch(/"access_token" TEXT/);
  });
});
