import { fail, ok, type Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { ImportUrl } from '@domain/imports/import-url';
import { SourcePlatform } from '@domain/recipes/source-platform';
import type {
  ImportRecipeRequest,
  ImportRecipeResult,
  RecipeImporterInterface,
} from '@application/ai/ports/recipe-importer-interface';
import { safeFetch } from '@infrastructure/imports/web/safe-fetch';
import { findJsonLdRecipe } from '@infrastructure/imports/web/find-json-ld-recipe';
import { findMicrodataRecipe } from '@infrastructure/imports/web/find-microdata-recipe';
import { jsonLdToRecipe } from '@infrastructure/imports/web/json-ld-to-recipe';

/** A recipe page with its scripts inlined is rarely past 1 MB; 3 MB is generous. */
const MAX_PAGE_BYTES = 3_000_000;
/** Below the completion route's 2.8 MB base64 cap once encoded. */
const MAX_IMAGE_BYTES = 2_000_000;
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1';
const IMAGE_ACCEPT = 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8';
/**
 * Raster types only. The bytes reach `sharp` on the API box, so an SVG (a
 * document, not a picture) or an animated GIF is not a cover worth the risk.
 */
const IMAGE_TYPE = /^image\/(?:jpeg|png|webp|avif)\b/i;
const WWW_PREFIX = /^www\./;
const NO_RECIPE = 'errors.import.no_recipe_on_page';
const PROVIDER = 'schema.org';

/**
 * Reads a recipe off a web page from the schema.org markup the page already
 * carries — no model, no video, seconds instead of a minute.
 *
 * @remarks
 * - **JSON-LD first, microdata second.** Most sites publish the former; some
 *   of the largest Turkish ones only the latter.
 * - **Most recipe sites publish this markup** because search engines ask for
 *   it, so it is the page's own statement of its ingredients and steps, not a
 *   guess at them. That is also why `aiWritten` is false.
 * - **The cover is the page's own photo, fetched through the same guard as
 *   the page.** An image URL is just another address a page chose, and it
 *   could as easily point inside the box's network.
 * - **A photo that cannot be fetched costs the cover, never the recipe**, the
 *   same trade the video path makes with a failed frame.
 * - **The site's host is the handle** (`nefisyemektarifleri.com`), so the
 *   recipe names its source the way a video names its account.
 */
export class WebPageRecipeImporter implements RecipeImporterInterface {
  async import(req: ImportRecipeRequest): Promise<Result<ImportRecipeResult, Failure>> {
    const url = ImportUrl.create(req.url);
    if (!url.ok) return url;

    const page = await safeFetch(url.value.toString(), {
      maxBytes: MAX_PAGE_BYTES,
      accept: HTML_ACCEPT,
      signal: req.signal,
    });
    if (!page.ok) return page;

    const html = page.value.body.toString('utf8');
    const node = findJsonLdRecipe(html) ?? findMicrodataRecipe(html);
    const found = node === null ? null : jsonLdToRecipe(node, page.value.finalUrl);
    if (found === null) return fail(new UnprocessableFailure(NO_RECIPE));

    return ok({
      recipe: found.recipe,
      modelUsed: PROVIDER,
      provider: PROVIDER,
      coverFrameJpegBase64: await this.cover(found.imageUrl, req.signal),
      sourceHandle: url.value.host.replace(WWW_PREFIX, ''),
      sourcePlatform: SourcePlatform.Web,
      aiWritten: false,
    });
  }

  private async cover(imageUrl: string | null, signal: AbortSignal | undefined): Promise<string | null> {
    if (imageUrl === null) return null;
    const image = await safeFetch(imageUrl, { maxBytes: MAX_IMAGE_BYTES, accept: IMAGE_ACCEPT, signal });
    if (!image.ok || !IMAGE_TYPE.test(image.value.contentType)) return null;
    return image.value.body.toString('base64');
  }
}
