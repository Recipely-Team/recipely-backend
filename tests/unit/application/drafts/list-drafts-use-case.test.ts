import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import type { PageResult } from '@domain/common/page-result';
import { ListDraftsUseCase, type ListDraftsInput } from '@application/drafts/use-cases/list-drafts-use-case';

// ---- helpers ----------------------------------------------------------------

function makeDraft(id: string, ownerId: string = 'user-1'): RecipeDraft {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = RecipeDraft.create({
    id,
    ownerId,
    prompt: `prompt for ${id}`,
    snapshot: {},
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function repoReturningPage(page: PageResult<RecipeDraft>): IRecipeDraftRepository {
  return {
    async listByOwner() { return ok(page); },
    async getById() { return fail(new UnknownFailure()); },
    async upsert() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

function failingListRepo(): IRecipeDraftRepository {
  return {
    async listByOwner() { return fail(new UnknownFailure('errors.db.read_failed')); },
    async getById() { return fail(new UnknownFailure()); },
    async upsert() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

function makeInput(overrides: Partial<ListDraftsInput> = {}): ListDraftsInput {
  return { ownerId: 'user-1', page: 1, pageSize: 10, ...overrides };
}

// ---- tests ------------------------------------------------------------------

describe('ListDraftsUseCase — success', () => {
  it('returns ok with items mapped to RecipeDraftDto', async () => {
    const drafts = [makeDraft('d-1'), makeDraft('d-2')];
    const page: PageResult<RecipeDraft> = { items: drafts, total: 2, page: 1, pageSize: 10 };
    const useCase = new ListDraftsUseCase(repoReturningPage(page));

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0]!.id).toBe('d-1');
    expect(result.value.items[1]!.id).toBe('d-2');
  });

  it('preserves pagination metadata (total, page, pageSize)', async () => {
    const page: PageResult<RecipeDraft> = {
      items: [makeDraft('d-3')],
      total: 25,
      page: 3,
      pageSize: 5,
    };
    const useCase = new ListDraftsUseCase(repoReturningPage(page));

    const result = await useCase.execute(makeInput({ page: 3, pageSize: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(25);
    expect(result.value.page).toBe(3);
    expect(result.value.pageSize).toBe(5);
  });

  it('returns ok with empty items list when the page has no results', async () => {
    const page: PageResult<RecipeDraft> = { items: [], total: 0, page: 1, pageSize: 10 };
    const useCase = new ListDraftsUseCase(repoReturningPage(page));

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(0);
    expect(result.value.total).toBe(0);
  });

  it('maps createdAt to ISO string on each item', async () => {
    const drafts = [makeDraft('d-1')];
    const page: PageResult<RecipeDraft> = { items: drafts, total: 1, page: 1, pageSize: 10 };
    const useCase = new ListDraftsUseCase(repoReturningPage(page));

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value.items[0]!.createdAt).toBe('string');
  });
});

describe('ListDraftsUseCase — repo failure', () => {
  it('propagates repo failure', async () => {
    const useCase = new ListDraftsUseCase(failingListRepo());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
  });
});
