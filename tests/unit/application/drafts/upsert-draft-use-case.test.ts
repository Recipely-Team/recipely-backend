import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { UpsertDraftUseCase, type UpsertDraftInput } from '@application/drafts/use-cases/upsert-draft-use-case';

// ---- helpers ----------------------------------------------------------------

function makeInput(overrides: Partial<UpsertDraftInput> = {}): UpsertDraftInput {
  return {
    id: 'draft-1',
    ownerId: 'user-1',
    prompt: 'make me a pasta',
    snapshot: { name: 'Draft Pasta' },
    chatHistory: [],
    ...overrides,
  };
}

function makeSavedDraft(input: UpsertDraftInput): RecipeDraft {
  const now = new Date();
  const result = RecipeDraft.create({
    id: input.id,
    ownerId: input.ownerId,
    prompt: input.prompt,
    snapshot: input.snapshot,
    chatHistory: input.chatHistory,
    createdAt: now,
    updatedAt: now,
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function successRepo(savedDraft: RecipeDraft): IRecipeDraftRepository {
  return {
    // getById returns not_found so UpsertDraftUseCase treats this as a new draft.
    async upsert() { return ok(savedDraft); },
    async getById() { return fail(new NotFoundFailure('errors.not_found.draft')); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

function failingRepo(): IRecipeDraftRepository {
  return {
    async upsert() { return fail(new UnknownFailure('errors.db.write_failed')); },
    async getById() { return fail(new NotFoundFailure('errors.not_found.draft')); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

// Repo where getById returns an existing draft owned by a DIFFERENT user.
function repoWithExistingDraft(existingOwner: string, draftId: string): {
  repo: IRecipeDraftRepository;
  upsertCalls: () => number;
} {
  const now = new Date();
  const existing = RecipeDraft.create({
    id: draftId,
    ownerId: existingOwner,
    prompt: 'original prompt',
    snapshot: {},
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!existing.ok) throw new Error('Test setup failed');
  const existingDraft = existing.value;

  let upsertCallCount = 0;
  const repo: IRecipeDraftRepository = {
    async upsert() { upsertCallCount++; return ok(existingDraft); },
    async getById() { return ok(existingDraft); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
  return { repo, upsertCalls: () => upsertCallCount };
}

// Repo where getById returns an unexpected non-not_found failure.
function repoWithGetByIdFailure(): IRecipeDraftRepository {
  return {
    async upsert() { return fail(new UnknownFailure('should not be called')); },
    async getById() { return fail(new UnknownFailure('errors.db.read_failed')); },
    async listByOwner() { return fail(new UnknownFailure()); },
    async getLatestByOwner() { return fail(new UnknownFailure()); },
    async delete() { return fail(new UnknownFailure()); },
  };
}

// ---- tests ------------------------------------------------------------------

describe('UpsertDraftUseCase — success', () => {
  it('returns ok with a RecipeDraftDto when repo upsert succeeds', async () => {
    const input = makeInput();
    const useCase = new UpsertDraftUseCase(successRepo(makeSavedDraft(input)));

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('draft-1');
    expect(result.value.ownerId).toBe('user-1');
    expect(result.value.prompt).toBe('make me a pasta');
  });

  it('returned dto has createdAt and updatedAt as ISO strings', async () => {
    const input = makeInput();
    const useCase = new UpsertDraftUseCase(successRepo(makeSavedDraft(input)));

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value.createdAt).toBe('string');
    expect(typeof result.value.updatedAt).toBe('string');
    // Validate ISO format
    expect(() => new Date(result.value.createdAt)).not.toThrow();
  });

  it('snapshot is passed through to the returned dto', async () => {
    const input = makeInput({ snapshot: { name: 'Test Dish', servings: 2 } });
    const useCase = new UpsertDraftUseCase(successRepo(makeSavedDraft(input)));

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot).toEqual({ name: 'Test Dish', servings: 2 });
  });
});

describe('UpsertDraftUseCase — validation failure', () => {
  it('returns ValidationFailure when id is empty (domain validation propagates)', async () => {
    const input = makeInput({ id: '' });
    // Repo will never be called; pass a stub that always fails to prove it
    const useCase = new UpsertDraftUseCase(failingRepo());

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });

  it('returns ValidationFailure when ownerId is empty (domain validation propagates)', async () => {
    const input = makeInput({ ownerId: '' });
    const useCase = new UpsertDraftUseCase(failingRepo());

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});

describe('UpsertDraftUseCase — repo failure', () => {
  it('propagates repo upsert failure', async () => {
    const input = makeInput();
    const useCase = new UpsertDraftUseCase(failingRepo());

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.db.write_failed');
  });
});

describe('UpsertDraftUseCase — IDOR ownership check', () => {
  it('returns ForbiddenFailure when the existing draft belongs to a different owner', async () => {
    const DRAFT_ID = 'draft-1';
    const REAL_OWNER = 'user-1';
    const ATTACKER = 'user-2';
    const { repo } = repoWithExistingDraft(REAL_OWNER, DRAFT_ID);

    const input = makeInput({ id: DRAFT_ID, ownerId: ATTACKER });
    const useCase = new UpsertDraftUseCase(repo);

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('forbidden');
  });

  it('never calls repo.upsert when the ownership check fails', async () => {
    const DRAFT_ID = 'draft-1';
    const REAL_OWNER = 'user-1';
    const ATTACKER = 'user-2';
    const { repo, upsertCalls } = repoWithExistingDraft(REAL_OWNER, DRAFT_ID);

    const input = makeInput({ id: DRAFT_ID, ownerId: ATTACKER });
    const useCase = new UpsertDraftUseCase(repo);

    await useCase.execute(input);

    expect(upsertCalls()).toBe(0);
  });

  it('allows upsert when the caller is the owner of the existing draft', async () => {
    const DRAFT_ID = 'draft-1';
    const OWNER = 'user-1';
    const { repo, upsertCalls } = repoWithExistingDraft(OWNER, DRAFT_ID);

    const input = makeInput({ id: DRAFT_ID, ownerId: OWNER });
    const useCase = new UpsertDraftUseCase(repo);

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    expect(upsertCalls()).toBe(1);
  });
});

describe('UpsertDraftUseCase — getById non-not_found failure propagation', () => {
  it('propagates an unexpected getById failure without calling upsert', async () => {
    const input = makeInput();
    const useCase = new UpsertDraftUseCase(repoWithGetByIdFailure());

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('errors.db.read_failed');
  });
});
