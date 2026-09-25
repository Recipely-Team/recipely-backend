import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
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
    return url.value.isVideo ? this.video.import(req) : this.webPage.import(req);
  }
}
