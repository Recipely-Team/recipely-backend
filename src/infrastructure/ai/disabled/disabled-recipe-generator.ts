import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  GenerateRecipeRequest,
  GenerateRecipeResult,
  RecipeGeneratorInterface,
} from '@application/ai/ports/recipe-generator-interface';

// Fallback adapter used when the configured provider's API key is missing.
// Keeps the server bootable in environments that have not yet wired up AI —
// the /generate endpoint just returns a clear error until the key is set,
// instead of crashing the whole API on boot.
export class DisabledRecipeGenerator implements RecipeGeneratorInterface {
  async generate(_req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>> {
    return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
  }
}
