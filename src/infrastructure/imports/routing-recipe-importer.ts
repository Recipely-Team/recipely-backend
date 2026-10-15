import type { Result } from '@core/result/result';
import { UnprocessableFailure, type Failure } from '@core/failure';
import { ImportUrl } from '@domain/imports/import-url';
import { SourcePlatform } from '@domain/recipes/source-platform';
import type {
  ImportRecipeRequest,
  ImportRecipeResult,
  RecipeImporterInterface,
} from '@application/ai/ports/recipe-importer-interface';

/**
 * Sends each link to the importer that can read it: a YouTube video to the
 * YouTube Data API reader, a post on another allowlisted video platform to
 * yt-dlp and a model, anything else to the page reader.
 *
 * @remarks
 * - **The split is `ImportUrl`'s, made once** — so a web page can never reach
 *   yt-dlp, which would fetch whatever it is handed without asking where it
 *   points.
 * - **YouTube is decided first and never falls through to yt-dlp**: YouTube
 *   refuses yt-dlp from our servers, so a YouTube link there would only spend
 *   a download attempt to fail.
 * - **A Pinterest pin tries the page reader first, then the video.** Most
 *   recipe pins link to the blog that holds the recipe, which the page reader
 *   follows in seconds with no model. A video or idea pin has no such link —
 *   the recipe is in the pin — so only an "unprocessable" answer (no link, or
 *   no recipe where it led) moves on to yt-dlp and a model. A fetch that could
 *   not run at all is returned as it is.
 */
export class RoutingRecipeImporter implements RecipeImporterInterface {
  constructor(
    private readonly video: RecipeImporterInterface,
    private readonly webPage: RecipeImporterInterface,
    private readonly youTube: RecipeImporterInterface,
  ) {}

  async import(req: ImportRecipeRequest): Promise<Result<ImportRecipeResult, Failure>> {
    const url = ImportUrl.create(req.url);
    if (!url.ok) return url;
    if (url.value.platform === SourcePlatform.YouTube) return this.youTube.import(req);
    if (url.value.platform === SourcePlatform.Pinterest) {
      const linked = await this.webPage.import(req);
      return !linked.ok && linked.failure instanceof UnprocessableFailure ? this.video.import(req) : linked;
    }
    return url.value.isVideo ? this.video.import(req) : this.webPage.import(req);
  }
}
