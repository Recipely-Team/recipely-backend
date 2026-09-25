import { SourcePlatform, type SourcePlatformType } from '@domain/recipes/source-platform';
import type { RecipeMedia } from '@domain/recipes/recipe-media';
import type { ImportedFingerprint } from '@domain/recipes/publishing/imported-fingerprint';
import { fingerprintLines } from '@domain/recipes/publishing/content-fingerprint';
import { PublishBlocker, type PublishBlockerType } from '@domain/recipes/publishing/publish-blocker';

/** The parts of a recipe the gate reads. */
interface GatedContent extends ImportedFingerprint {
  readonly sourcePlatform?: SourcePlatformType | null | undefined;
  readonly image: string;
  readonly media: readonly RecipeMedia[];
  readonly ingredients: Readonly<Record<string, string[]>>;
  readonly instructions: Readonly<Record<string, string[]>>;
}

/** Still the imported text when ANY locale's list hashes to what was imported. */
const stillImported = (lists: Readonly<Record<string, string[]>>, hash: string | null | undefined): boolean =>
  hash != null && Object.values(lists).some((lines) => fingerprintLines(lines) === hash);

/**
 * What keeps a web import out of the feed, in checklist order.
 *
 * @remarks
 * - **A photo blocks wherever it sits**: as the cover or anywhere in the
 *   gallery. Moving the site's photo from one to the other is not removing it.
 * - **A missing fingerprint blocks nothing.** Rows from before the gate, and
 *   imports whose cover never stored, carry `null` — the gate cannot hold a
 *   recipe to a comparison it has nothing to compare against.
 */
export const publishBlockersOf = (content: GatedContent): PublishBlockerType[] => {
  if (content.sourcePlatform !== SourcePlatform.Web) return [];
  const blockers: PublishBlockerType[] = [];
  const photo = content.importedImage;
  if (photo != null && photo.length > 0 && (content.image === photo || content.media.some((m) => m.url === photo))) {
    blockers.push(PublishBlocker.Photo);
  }
  if (stillImported(content.ingredients, content.importedIngredientsHash)) blockers.push(PublishBlocker.Ingredients);
  if (stillImported(content.instructions, content.importedInstructionsHash)) blockers.push(PublishBlocker.Instructions);
  return blockers;
};
