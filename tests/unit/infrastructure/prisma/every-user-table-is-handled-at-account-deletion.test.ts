import { readFileSync } from 'fs';
import path from 'path';

// Account deletion is a tombstone, so nothing cascades: a table that holds a
// user's rows and is not named by the deletion path simply keeps them, with no
// error anywhere. This reads the schema for every model related to `User` and
// requires each to be touched by the deletion code — or listed below, on
// purpose, with the reason it stays.

const ROOT = path.join(__dirname, '../../../..');
const DELETION_CODE = [
  'src/infrastructure/repositories/auth/prisma-auth-repository.ts',
  'src/infrastructure/repositories/diary/prisma-food-diary-repository.ts',
  'src/infrastructure/repositories/instagram/prisma-instagram-connection-repository.ts',
].map((file) => readFileSync(path.join(ROOT, file), 'utf8')).join('\n');

/** Kept attached to the tombstone, unreachable because the account can no longer sign in. */
const RETAINED: Readonly<Record<string, string>> = {
  RecipeDraft: 'unreachable once the account cannot authenticate',
  ImportJob: 'unreachable once the account cannot authenticate',
  AIGenerationLog: 'cost/abuse audit, no user text exposed',
  AssistantUsage: 'quota counters, no personal content',
};

describe('account deletion coverage', () => {
  const schema = readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const userModels = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    .filter(([, name, body]) => name !== 'User' && /\s+User(\?)?\s+@relation\(/.test(body ?? ''))
    .map(([, name]) => name as string);

  it('finds the user-owned models', () => {
    expect(userModels).toEqual(expect.arrayContaining(['Favorite', 'FoodLogEntry', 'ShoppingListItem']));
  });

  it.each(userModels.filter((name) => !(name in RETAINED)))('%s is wiped or scrubbed when an account is deleted', (model) => {
    const accessor = model.charAt(0).toLowerCase() + model.slice(1);
    expect(DELETION_CODE).toMatch(new RegExp(`\\.${accessor}\\.(deleteMany|updateMany|delete|update)\\(`));
  });
});
