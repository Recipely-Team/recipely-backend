import { RecipeDraft, type RecipeDraftProps } from '@domain/drafts/recipe-draft';

function baseProps(overrides: Partial<RecipeDraftProps> = {}): RecipeDraftProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'draft-1',
    ownerId: 'user-1',
    prompt: 'Make me a pasta dish',
    snapshot: {},
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('RecipeDraft.create — success', () => {
  it('returns ok with a RecipeDraft when all required props are valid', () => {
    const result = RecipeDraft.create(baseProps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(RecipeDraft);
    expect(result.value.id).toBe('draft-1');
    expect(result.value.ownerId).toBe('user-1');
  });

  it('returns ok when snapshot is empty (snapshot is not validated)', () => {
    const result = RecipeDraft.create(baseProps({ snapshot: {} }));

    expect(result.ok).toBe(true);
  });

  it('returns ok when chatHistory is non-empty', () => {
    const result = RecipeDraft.create(
      baseProps({
        chatHistory: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chatHistory).toHaveLength(1);
  });

  it('exposes getters matching the provided props', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    const props = baseProps({
      prompt: 'vegan tacos',
      snapshot: { name: 'Tacos' },
      createdAt: now,
      updatedAt: now,
    });
    const result = RecipeDraft.create(props);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompt).toBe('vegan tacos');
    expect(result.value.snapshot).toEqual({ name: 'Tacos' });
    expect(result.value.createdAt).toEqual(now);
    expect(result.value.updatedAt).toEqual(now);
  });

  it('toRaw returns all props unchanged', () => {
    const props = baseProps();
    const result = RecipeDraft.create(props);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toRaw()).toEqual(props);
  });
});

describe('RecipeDraft.create — ValidationFailure paths', () => {
  it('returns ValidationFailure when id is empty string', () => {
    const result = RecipeDraft.create(baseProps({ id: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.id_required');
  });

  it('returns ValidationFailure when id is whitespace only', () => {
    const result = RecipeDraft.create(baseProps({ id: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.id_required');
  });

  it('returns ValidationFailure when ownerId is empty string', () => {
    const result = RecipeDraft.create(baseProps({ ownerId: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.owner_required');
  });

  it('returns ValidationFailure when ownerId is whitespace only', () => {
    const result = RecipeDraft.create(baseProps({ ownerId: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.owner_required');
  });

  it('id validation fires before ownerId validation', () => {
    const result = RecipeDraft.create(baseProps({ id: '', ownerId: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.validation.id_required');
  });
});
