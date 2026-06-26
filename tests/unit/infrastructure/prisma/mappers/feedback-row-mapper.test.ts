import type { Feedback as FeedbackRow } from '@prisma/client';
import { FeedbackRowMapper } from '@infrastructure/prisma/mappers/feedback.row-mapper';

function baseRow(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'feedback-1',
    userId: 'user-1',
    category: 'bug',
    subject: null,
    message: 'It broke',
    rating: null,
    contactEmail: null,
    status: 'new',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as FeedbackRow;
}

describe('FeedbackRowMapper.toDomain', () => {
  it('maps a full row to a domain entity', () => {
    const row = baseRow({ subject: 'Bug', rating: 3, contactEmail: 'a@b.com' });

    const result = FeedbackRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe('user-1');
    expect(result.value.category).toBe('bug');
    expect(result.value.subject).toBe('Bug');
    expect(result.value.rating).toBe(3);
    expect(result.value.contactEmail).toBe('a@b.com');
    expect(result.value.status).toBe('new');
  });

  it('handles null optional columns', () => {
    const result = FeedbackRowMapper.toDomain(baseRow());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subject).toBeUndefined();
    expect(result.value.rating).toBeUndefined();
    expect(result.value.contactEmail).toBeUndefined();
  });

  it('falls back to "other" for a corrupt category', () => {
    const result = FeedbackRowMapper.toDomain(baseRow({ category: 'garbage' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('other');
  });

  it('falls back to "new" for a corrupt status', () => {
    const result = FeedbackRowMapper.toDomain(baseRow({ status: 'archived' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('new');
  });

  it('returns an UnknownFailure for a row that fails domain validation', () => {
    const result = FeedbackRowMapper.toDomain(baseRow({ message: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
  });
});
