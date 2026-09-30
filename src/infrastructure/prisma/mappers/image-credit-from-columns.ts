import { ImageCredit } from '@domain/recipes/curated/image-credit';

/**
 * The credit three nullable columns spell, or `null`.
 *
 * All three are set together by the curated import and are `null` everywhere
 * else. A partial or invalid set (a licence this build does not know, say)
 * reads as no credit rather than failing the whole row: a recipe that cannot
 * show its credit line is still a recipe.
 */
export const imageCreditFromColumns = (
  author: string | null | undefined,
  license: string | null | undefined,
  url: string | null | undefined,
): ImageCredit | null => {
  if (author == null || license == null || url == null) return null;
  const credit = ImageCredit.create({ author, license, url });
  return credit.ok ? credit.value : null;
};
