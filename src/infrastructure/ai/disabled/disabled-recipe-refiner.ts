import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  RefineRecipeRequest,
  RefineRecipeResult,
  RecipeRefinerInterface,
} from '@application/ai/ports/recipe-refiner-interface';

// Fallback adapter used when the configured provider's API key is missing.
// Keeps the server bootable in environments that have not yet wired up AI.
export class DisabledRecipeRefiner implements RecipeRefinerInterface {
  async refine(_req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
  }
}
