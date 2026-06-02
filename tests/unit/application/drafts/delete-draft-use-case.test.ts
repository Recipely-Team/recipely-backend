import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { DeleteDraftUseCase, type DeleteDraftInput } from '@application/drafts/use-cases/delete-draft-use-case';

// ---- helpers ----------------------------------------------------------------

function makeDraft(id: string, ownerId: string): RecipeDraft {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = RecipeDraft.create({
    id,
    ownerId,
    prompt: 'test prompt',
    snapshot: {},
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function repoWithDraft(draft: RecipeDraft, deleteResult: 'ok' | 'fail' = 'ok'): IRecipeDraftRepository {
  return {
    async getById(id) {
      return id === draft.id ? ok(draft) : fail(new NotFoundFailure('errors.draft.not_found'));
    },
    async delete() {
      return deleteResult === 'ok'
        ? ok(undefined as void)
        : fail(new UnknownFailure('errors.db.delete_failed'));
    },
    async upsert() { return fail(new UnknownFailure()); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
  };
}

function notFoundRepo(): IRecipeDraftRepository {
  return {
    async getById() { return fail(new NotFoundFailure('errors.draft.not_found')); },
    async delete() { return ok(undefined as void); },
    async upsert() { return fail(new UnknownFailure()); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
  };
}

// ---- tests ------------------------------------------------------------------

describe('DeleteDraftUseCase — success', () => {
  it('returns ok (void) when draft exists and requesterId matches ownerId', async () => {
    const draft = makeDraft('draft-del', 'user-3');
    const useCase = new DeleteDraftUseCase(repoWithDraft(draft, 'ok'));
    const input: DeleteDraftInput = { id: 'draft-del', requesterId: 'user-3' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
  });
});

describe('DeleteDraftUseCase — not found', () => {
  it('propagates NotFoundFailure when draft does not exist', async () => {
    const useCase = new DeleteDraftUseCase(notFoundRepo());
    const input: DeleteDraftInput = { id: 'ghost-draft', requesterId: 'user-3' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('DeleteDraftUseCase — cross-owner access', () => {
  it('returns ForbiddenFailure when requesterId does not match draft ownerId', async () => {
    const draft = makeDraft('draft-del', 'user-3');
    const useCase = new DeleteDraftUseCase(repoWithDraft(draft, 'ok'));
    const input: DeleteDraftInput = { id: 'draft-del', requesterId: 'user-attacker' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
  });

  it('ForbiddenFailure carries the standard messageKey', async () => {
    const draft = makeDraft('draft-del', 'user-3');
    const useCase = new DeleteDraftUseCase(repoWithDraft(draft, 'ok'));
    const input: DeleteDraftInput = { id: 'draft-del', requesterId: 'wrong-user' };

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.forbidden');
  });

  it('does not call repo.delete when the requester is not the owner', async () => {
    const deleteMock = jest.fn().mockResolvedValue(ok(undefined as void));
    const draft = makeDraft('draft-del', 'user-3');
    const repo: IRecipeDraftRepository = {
      async getById() { return ok(draft); },
      delete: deleteMock,
      async upsert() { return fail(new UnknownFailure()); },
      async listByOwner() { return fail(new UnknownFailure()); },
      async getLatestByOwner() { return fail(new UnknownFailure()); },
    };
    const useCase = new DeleteDraftUseCase(repo);

    await useCase.execute({ id: 'draft-del', requesterId: 'wrong-user' });

    expect(deleteMock).not.toHaveBeenCalled();
  });
});
