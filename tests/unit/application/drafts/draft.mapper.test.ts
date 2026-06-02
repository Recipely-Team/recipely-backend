import { RecipeDraft } from '@domain/drafts/recipe-draft';
import { DraftMapper } from '@application/drafts/mappers/draft.mapper';

function makeRecipeDraft(overrides: {
  id?: string;
  ownerId?: string;
  prompt?: string;
  snapshot?: object;
  createdAt?: Date;
  updatedAt?: Date;
} = {}): RecipeDraft {
  const createdAt = overrides.createdAt ?? new Date('2026-01-01T00:00:00Z');
  const updatedAt = overrides.updatedAt ?? new Date('2026-01-02T12:00:00Z');
  const result = RecipeDraft.create({
    id: overrides.id ?? 'draft-42',
    ownerId: overrides.ownerId ?? 'owner-99',
    prompt: overrides.prompt ?? 'a vegetarian soup',
    snapshot: overrides.snapshot ?? { name: 'Veggie Soup', servings: 4 },
    chatHistory: [{ role: 'user', content: 'refine it' }],
    createdAt,
    updatedAt,
  });
  if (!result.ok) throw new Error('Test setup failed: ' + result.failure.messageKey);
  return result.value;
}

describe('DraftMapper.toDto', () => {
  it('copies id, ownerId, prompt, snapshot and chatHistory fields directly', () => {
    const draft = makeRecipeDraft();

    const dto = DraftMapper.toDto(draft);

    expect(dto.id).toBe('draft-42');
    expect(dto.ownerId).toBe('owner-99');
    expect(dto.prompt).toBe('a vegetarian soup');
    expect(dto.snapshot).toEqual({ name: 'Veggie Soup', servings: 4 });
    expect(dto.chatHistory).toEqual([{ role: 'user', content: 'refine it' }]);
  });

  it('converts createdAt Date to ISO string', () => {
    const createdAt = new Date('2025-11-15T09:30:00.000Z');
    const draft = makeRecipeDraft({ createdAt });

    const dto = DraftMapper.toDto(draft);

    expect(dto.createdAt).toBe('2025-11-15T09:30:00.000Z');
  });

  it('converts updatedAt Date to ISO string', () => {
    const updatedAt = new Date('2026-04-20T17:00:00.000Z');
    const draft = makeRecipeDraft({ updatedAt });

    const dto = DraftMapper.toDto(draft);

    expect(dto.updatedAt).toBe('2026-04-20T17:00:00.000Z');
  });

  it('preserves an empty snapshot object', () => {
    const draft = makeRecipeDraft({ snapshot: {} });

    const dto = DraftMapper.toDto(draft);

    expect(dto.snapshot).toEqual({});
  });
});
