import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  InstagramRecipeImporterInterface,
  ImportInstagramRecipeRequest,
  ImportInstagramRecipeResult,
} from '@application/ai/ports/instagram-recipe-importer-interface';

// Fallback adapter used when GROQ_API_KEY is missing. Keeps the server
// bootable — the /recipes/import endpoint returns a clear error until the
// key is set, instead of crashing the whole API on boot.
export class DisabledInstagramRecipeImporter implements InstagramRecipeImporterInterface {
  async import(
    _req: ImportInstagramRecipeRequest,
  ): Promise<Result<ImportInstagramRecipeResult, Failure>> {
    return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
  }
}
