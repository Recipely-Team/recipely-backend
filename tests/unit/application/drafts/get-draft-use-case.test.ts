import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { GetDraftUseCase, type GetDraftInput } from '@application/drafts/use-cases/get-draft-use-case';

// ---- helpers ----------------------------------------------------------------

function makeDraft(id: string, ownerId: string): RecipeDraft {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = RecipeDraft.create({
    id,
    ownerId,
    prompt: 'spaghetti bolognese',
    snapshot: {},
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function repoReturning(draft: RecipeDraft): IRecipeDraftRepository {
  return {
    async getById() { return ok(draft); },
    async upsert() { return fail(new UnknownFailure()); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

function notFoundRepo(): IRecipeDraftRepository {
  return {
    async getById() { return fail(new NotFoundFailure('errors.draft.not_found')); },
    async upsert() { return fail(new UnknownFailure()); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

// ---- tests ------------------------------------------------------------------

describe('GetDraftUseCase — success', () => {
  it('returns ok with RecipeDraftDto when draft exists and requester is the owner', async () => {
    const draft = makeDraft('draft-10', 'user-5');
    const useCase = new GetDraftUseCase(repoReturning(draft));
    const input: GetDraftInput = { id: 'draft-10', requesterId: 'user-5' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('draft-10');
    expect(result.value.ownerId).toBe('user-5');
  });
});

describe('GetDraftUseCase — not found', () => {
  it('propagates NotFoundFailure when repo returns not_found', async () => {
    const useCase = new GetDraftUseCase(notFoundRepo());
    const input: GetDraftInput = { id: 'missing', requesterId: 'user-5' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('GetDraftUseCase — cross-owner access', () => {
  it('returns ForbiddenFailure when requesterId does not match draft ownerId', async () => {
    const draft = makeDraft('draft-10', 'user-5');
    const useCase = new GetDraftUseCase(repoReturning(draft));
    const input: GetDraftInput = { id: 'draft-10', requesterId: 'user-99' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
  });

  it('ForbiddenFailure carries the standard messageKey', async () => {
    const draft = makeDraft('draft-10', 'user-5');
    const useCase = new GetDraftUseCase(repoReturning(draft));
    const input: GetDraftInput = { id: 'draft-10', requesterId: 'attacker' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.forbidden');
  });
});
