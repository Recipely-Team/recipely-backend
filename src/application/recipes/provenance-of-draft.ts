import { RecipeOrigin, type RecipeOriginType } from '@domain/recipes/recipe-origin';
import { toSourcePlatform } from '@domain/recipes/to-source-platform';
import type { SourcePlatformType } from '@domain/recipes/source-platform';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import type { ImportedFingerprint } from '@domain/recipes/publishing/imported-fingerprint';

/** What a published recipe inherits from the draft it came out of, fingerprint included. */
interface Provenance extends ImportedFingerprint {
  readonly origin: RecipeOriginType;
  readonly sourceUrl?: string;
  readonly sourceHandle?: string;
  readonly sourcePlatform: SourcePlatformType | null;
  readonly aiWritten: boolean;
}

/** A recipe with no draft behind it: somebody wrote it, and nothing else is claimed. */
const HAND_WRITTEN: Provenance = {
  origin: RecipeOrigin.User,
  sourcePlatform: null,
  aiWritten: false,
};

/**
 * Where the text came from, according to the draft that carried it.
 *
 * @remarks
 * - **The draft is the only thing that knows.** By the time a recipe is
 *   published the trail is cold: an import that a cook edited for a week
 *   arrives looking exactly like something typed out by hand. The draft records
 *   it at the one moment it is known and this reads it back.
 * - **Best-effort, deliberately.** It runs inside a publish the user has
 *   already been told is happening, so a draft that cannot be read — missing,
 *   malformed, written before the field existed — costs a badge and never the
 *   recipe. The fallback is the truthful answer for a recipe with no draft
 *   behind it: somebody wrote it.
 */
export const provenanceOfDraft = async (
  drafts: RecipeDraftRepositoryInterface,
  fromDraftId: string | undefined,
): Promise<Provenance> => {
  if (fromDraftId === undefined) return HAND_WRITTEN;

  const found = await drafts.getById(fromDraftId);
  if (!found.ok) return HAND_WRITTEN;

  const snapshot = found.value.snapshot ?? {};
  const origin = snapshot.origin ?? RecipeOrigin.User;
  return {
    origin,
    ...(snapshot.sourceUrl !== undefined ? { sourceUrl: snapshot.sourceUrl } : {}),
    ...(snapshot.sourceHandle !== undefined ? { sourceHandle: snapshot.sourceHandle } : {}),
    sourcePlatform: toSourcePlatform(snapshot.sourcePlatform),
    // A draft written before these fields existed still knows what it was: an
    // import is a model's work by definition, since the model is what turns a
    // video into a recipe. Reading it from `origin` keeps those drafts right
    // rather than quietly marking them hand-written.
    aiWritten: snapshot.aiWritten ?? origin !== RecipeOrigin.User,
    // What a web import arrived as, for the copyright gate. Absent on every
    // other draft, and on web drafts from before the gate — both mean no gate.
    importedImage: snapshot.importedImage ?? null,
    importedIngredientsHash: snapshot.importedIngredientsHash ?? null,
    importedInstructionsHash: snapshot.importedInstructionsHash ?? null,
  };
};
