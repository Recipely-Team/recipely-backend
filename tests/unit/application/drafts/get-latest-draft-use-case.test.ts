import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { GetLatestDraftUseCase, type GetLatestDraftInput } from '@application/drafts/use-cases/get-latest-draft-use-case';

// ---- helpers ----------------------------------------------------------------

function makeDraft(id: string, ownerId: string): RecipeDraft {
  const now = new Date('2026-02-01T00:00:00Z');
  const result = RecipeDraft.create({
    id,
    ownerId,
    prompt: 'latest dish idea',
    snapshot: { name: 'Soup' },
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function repoReturning(draft: RecipeDraft): IRecipeDraftRepository {
  return {
    async getLatestByOwner() { return ok(draft); },
    async getById() { return fail(new UnknownFailure()); },
    async upsert() { return fail(new UnknownFailure()); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

function notFoundRepo(): IRecipeDraftRepository {
  return {
    async getLatestByOwner() { return fail(new NotFoundFailure('errors.draft.not_found')); },
    async getById() { return fail(new UnknownFailure()); },
    async upsert() { return fail(new UnknownFailure()); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

// ---- tests ------------------------------------------------------------------

describe('GetLatestDraftUseCase — success', () => {
  it('returns ok with the latest draft as RecipeDraftDto', async () => {
    const draft = makeDraft('draft-latest', 'user-7');
    const useCase = new GetLatestDraftUseCase(repoReturning(draft));
    const input: GetLatestDraftInput = { ownerId: 'user-7' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('draft-latest');
    expect(result.value.ownerId).toBe('user-7');
  });

  it('maps snapshot and chatHistory through to the dto', async () => {
    const draft = makeDraft('draft-latest', 'user-7');
    const useCase = new GetLatestDraftUseCase(repoReturning(draft));

    const result = await useCase.execute({ ownerId: 'user-7' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot).toEqual({ name: 'Soup' });
    expect(result.value.chatHistory).toEqual([]);
  });
});

describe('GetLatestDraftUseCase — not found', () => {
  it('propagates NotFoundFailure when owner has no drafts', async () => {
    const useCase = new GetLatestDraftUseCase(notFoundRepo());

    const result = await useCase.execute({ ownerId: 'user-with-no-drafts' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(result.failure.messageKey).toBe('errors.draft.not_found');
  });
});
