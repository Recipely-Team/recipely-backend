import { Comment, type CommentProps } from '@domain/comments/comment';

function makeProps(overrides: Partial<CommentProps> = {}): CommentProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'comment-1',
    body: 'Looks delicious',
    moderationStatus: 'approved',
    recipeId: 'recipe-1',
    authorId: 'author-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Comment.create', () => {
  it('returns ok for a valid minimal comment', () => {
    const result = Comment.create(makeProps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('comment-1');
    expect(result.value.body).toBe('Looks delicious');
    expect(result.value.moderationStatus).toBe('approved');
    expect(result.value.recipeId).toBe('recipe-1');
    expect(result.value.authorId).toBe('author-1');
    expect(result.value.toRaw().rating).toBeUndefined();
    expect(result.value.deletedAt).toBeUndefined();
  });

  it('returns ok and preserves an optional rating', () => {
    const result = Comment.create(makeProps({ rating: 4 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toRaw().rating).toBe(4);
  });

  it('returns ok and preserves an optional deletedAt', () => {
    const deletedAt = new Date('2026-02-01T00:00:00Z');
    const result = Comment.create(makeProps({ deletedAt }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deletedAt).toBe(deletedAt);
  });

  it.each([1, 2, 3, 4, 5])('accepts rating %i', (rating) => {
    const result = Comment.create(makeProps({ rating }));
    expect(result.ok).toBe(true);
  });

  it('exposes createdAt and updatedAt getters', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const updatedAt = new Date('2026-01-02T00:00:00Z');
    const result = Comment.create(makeProps({ createdAt, updatedAt }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.createdAt).toBe(createdAt);
    expect(result.value.updatedAt).toBe(updatedAt);
  });

  it('toRaw() returns the underlying props', () => {
    const props = makeProps({ rating: 3 });
    const result = Comment.create(props);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toRaw()).toEqual(props);
  });

  describe('validation failures (never throws, returns ValidationFailure)', () => {
    it('fails when id is empty', () => {
      const result = Comment.create(makeProps({ id: '   ' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('id');
    });

    it('fails when body is empty', () => {
      const result = Comment.create(makeProps({ body: '   ' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('body');
    });

    it('fails when body exceeds 2000 chars', () => {
      const result = Comment.create(makeProps({ body: 'a'.repeat(2001) }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('body');
    });

    it('accepts body at exactly 2000 chars', () => {
      const result = Comment.create(makeProps({ body: 'a'.repeat(2000) }));
      expect(result.ok).toBe(true);
    });

    it('fails when recipeId is empty', () => {
      const result = Comment.create(makeProps({ recipeId: '' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('recipeId');
    });

    it('fails when authorId is empty', () => {
      const result = Comment.create(makeProps({ authorId: '' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('authorId');
    });

    it.each([0, 6, -1])('fails when rating is out of range (%i)', (rating) => {
      const result = Comment.create(makeProps({ rating }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('rating');
    });

    it('fails when rating is not an integer', () => {
      const result = Comment.create(makeProps({ rating: 3.5 }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.field).toBe('rating');
    });
  });
});
