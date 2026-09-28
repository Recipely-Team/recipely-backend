import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  RecipeImporterInterface,
  ImportRecipeRequest,
  ImportRecipeResult,
} from '@application/ai/ports/recipe-importer-interface';

// Fallback adapter used when GROQ_API_KEY is missing. Keeps the server
// bootable — the /recipes/import endpoint returns a clear error until the
// key is set, instead of crashing the whole API on boot.
export class DisabledInstagramRecipeImporter implements RecipeImporterInterface {
  async import(
    _req: ImportRecipeRequest,
  ): Promise<Result<ImportRecipeResult, Failure>> {
    return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
  }
}
