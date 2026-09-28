import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { DraftRecipeSnapshot, ChatMessage } from '@domain/drafts/recipe-draft';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import { DraftMapper } from '@application/drafts/mappers/draft.mapper';
import type { RecipeDraftDto } from '@application/drafts/dtos/draft.dto';

export interface UpsertDraftInput {
  readonly id: string;
  readonly ownerId: string;
  readonly prompt: string;
  readonly snapshot: DraftRecipeSnapshot;
  readonly chatHistory: ChatMessage[];
}

/**
 * Snapshot fields only the server writes: where an import came from, and the
 * fingerprint the copyright gate compares against.
 */
const SERVER_OWNED = [
  'origin',
  'sourceUrl',
  'sourceHandle',
  'sourcePlatform',
  'aiWritten',
  'importedImage',
  'importedIngredientsHash',
  'importedInstructionsHash',
] as const satisfies readonly (keyof DraftRecipeSnapshot)[];

const pick = (snapshot: DraftRecipeSnapshot, owned: boolean): DraftRecipeSnapshot =>
  Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => (SERVER_OWNED as readonly string[]).includes(key) === owned),
  ) as DraftRecipeSnapshot;

/**
 * Saves the client's working copy of a draft.
 *
 * @remarks
 * - **The server's record survives a client save.** The app autosaves a draft
 *   the moment it is opened, and the client never sends provenance or the
 *   imported fingerprint — so replacing the snapshot wholesale erased them:
 *   an import opened once was published as hand-written, and a web import
 *   lost the fingerprint the copyright gate needs, which is a way round the
 *   gate. Those fields are now taken from the stored draft, never the body.
 */
export class UpsertDraftUseCase {
  constructor(private readonly repo: RecipeDraftRepositoryInterface) {}

  async execute(input: UpsertDraftInput): Promise<Result<RecipeDraftDto, Failure>> {
    // Ownership check: if a draft already exists under this id, only the owner
    // may overwrite it. A not_found response means this is a new draft — proceed.
    // Any other failure (e.g. UnknownFailure from DB) is propagated unchanged.
    const existing = await this.repo.getById(input.id);
    let serverRecord: DraftRecipeSnapshot = {};
    if (existing.ok) {
      serverRecord = pick(existing.value.snapshot, true);
      if (existing.value.ownerId !== input.ownerId) {
        return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
      }
    } else if (existing.failure.code !== 'not_found') {
      return existing;
    }

    const now = new Date();
    const draftResult = RecipeDraft.create({
      id: input.id,
      ownerId: input.ownerId,
      prompt: input.prompt,
      snapshot: { ...pick(input.snapshot, false), ...serverRecord },
      chatHistory: input.chatHistory,
      createdAt: now,
      updatedAt: now,
    });
    if (!draftResult.ok) return draftResult;

    const saved = await this.repo.upsert(draftResult.value);
    if (!saved.ok) return saved;

    return ok(DraftMapper.toDto(saved.value));
  }
}
