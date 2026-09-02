import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isModerationStatus, ModerationStatus } from '@domain/moderation/moderation-status';
import { ImportJobStatus } from '@domain/imports/import-job-status';

describe('isModerationStatus', () => {
  it('returns true for approved', () => {
    expect(isModerationStatus('approved')).toBe(true);
  });

  it('returns true for rejected', () => {
    expect(isModerationStatus('rejected')).toBe(true);
  });

  it('returns true for pending', () => {
    expect(isModerationStatus('pending')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isModerationStatus('')).toBe(false);
  });

  it('returns false for an arbitrary string', () => {
    expect(isModerationStatus('unknown')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isModerationStatus(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isModerationStatus(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isModerationStatus(1)).toBe(false);
  });

  it('covers every value in the ModerationStatus const object', () => {
    const allValues = Object.values(ModerationStatus);
    allValues.forEach(v => expect(isModerationStatus(v)).toBe(true));
  });
});

/**
 * The database writes these words too, and nothing type-checks that column.
 *
 * @remarks
 * `Recipe.moderationStatus` and `Comment.moderationStatus` carry
 * `@default("approved")` in `schema.prisma`, and `ImportJob.status` carries
 * `@default("queued")`. Renaming a member of the const object is a one-line
 * change that compiles, passes every other test, and silently orphans every
 * existing row — the default keeps writing the old word and no `WHERE` built
 * from the new one will ever match it. This is the only place the two spellings
 * are compared, so it is the only thing standing between a rename and a
 * migration nobody wrote.
 */
describe('the schema defaults agree with the vocabulary', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  const defaultsFor = (column: string): string[] => [
    ...schema.matchAll(new RegExp(`${column}\\s+String\\??\\s+@default\\("([a-z_]+)"\\)`, 'g')),
  ].map((match) => match[1] ?? '');

  it('defaults every moderationStatus column to a ModerationStatus member', () => {
    const defaults = defaultsFor('moderationStatus');
    expect(defaults.length).toBeGreaterThan(0);
    for (const value of defaults) {
      expect(Object.values(ModerationStatus)).toContain(value);
    }
  });

  it('defaults ImportJob.status to an ImportJobStatus member', () => {
    const defaults = defaultsFor('status');
    expect(defaults).toContain(ImportJobStatus.Queued);
  });
});
