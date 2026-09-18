import { RecipeOrigin, type RecipeOriginType } from '@domain/recipes/recipe-origin';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';

/** What a published recipe inherits from the draft it came out of. */
interface Provenance {
  readonly origin: RecipeOriginType;
  readonly sourceUrl?: string;
  readonly sourceHandle?: string;
}

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
  if (fromDraftId === undefined) return { origin: RecipeOrigin.User };

  const found = await drafts.getById(fromDraftId);
  if (!found.ok) return { origin: RecipeOrigin.User };

  const snapshot = found.value.snapshot ?? {};
  return {
    origin: snapshot.origin ?? RecipeOrigin.User,
    ...(snapshot.sourceUrl !== undefined ? { sourceUrl: snapshot.sourceUrl } : {}),
    ...(snapshot.sourceHandle !== undefined ? { sourceHandle: snapshot.sourceHandle } : {}),
  };
};
