import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { ModerationStatus } from '@domain/moderation/moderation-status';

/** The row an (owner, slug) key already names. */
export interface CuratedRecipeSnapshot {
  readonly id: string;
  /** Soft-deleted: someone took it down, so a re-import must not bring it back. */
  readonly deleted: boolean;
  /** The stored cover's URL. */
  readonly image: string;
  /** sha256 of the source photo that cover was made from; `null` if unknown. */
  readonly imageSourceHash: string | null;
  /** Visibility as moderation left it; a re-import never changes either. */
  readonly isPublished: boolean;
  /** The stored status, read as `Pending` when this build does not know it (fail closed). */
  readonly moderationStatus: ModerationStatus;
  /** The column exactly as stored, for the report — may be a value no vocabulary here names. */
  readonly storedStatus: string;
}

/**
 * Where curated recipes are kept, keyed by (owner, slug).
 *
 * @remarks
 * - **The key is what makes the import idempotent**: a re-run finds the row it
 *   made last time and replaces its content in place, so the id, the likes,
 *   the comments and the view count all survive.
 * - `replace` writes the content and provenance columns only — never the
 *   owner, the creation time, visibility (`isPublished`, `moderationStatus`)
 *   or anything readers produced.
 */
export interface CuratedRecipeRepositoryInterface {
  findBySlug(ownerId: string, slug: string): Promise<Result<CuratedRecipeSnapshot | null, Failure>>;
  /** `imageSourceHash` is the sha256 of the source photo the cover was stored from. */
  create(recipe: Recipe, imageSourceHash: string): Promise<Result<void, Failure>>;
  replace(recipe: Recipe, imageSourceHash: string): Promise<Result<void, Failure>>;
}
