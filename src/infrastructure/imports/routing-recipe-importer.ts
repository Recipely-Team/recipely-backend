import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { ImportUrl } from '@domain/imports/import-url';
import type {
  ImportRecipeRequest,
  ImportRecipeResult,
  RecipeImporterInterface,
} from '@application/ai/ports/recipe-importer-interface';

/**
 * Sends each link to the importer that can read it: a post on an allowlisted
 * video platform to yt-dlp and a model, anything else to the page reader.
 *
 * The split is `ImportUrl`'s, made once — so a web page can never reach
 * yt-dlp, which would fetch whatever it is handed without asking where it
 * points.
 */
export class RoutingRecipeImporter implements RecipeImporterInterface {
  constructor(
    private readonly video: RecipeImporterInterface,
    private readonly webPage: RecipeImporterInterface,
  ) {}

  async import(req: ImportRecipeRequest): Promise<Result<ImportRecipeResult, Failure>> {
    const url = ImportUrl.create(req.url);
    if (!url.ok) return url;
    return url.value.isVideo ? this.video.import(req) : this.webPage.import(req);
  }
}
