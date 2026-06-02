import { fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  RefineRecipeRequest,
  RefineRecipeResult,
  IRecipeRefiner,
} from '@application/ai/ports/i-recipe-refiner';

// Fallback adapter used when the configured provider's API key is missing.
// Keeps the server bootable in environments that have not yet wired up AI.
export class DisabledRecipeRefiner implements IRecipeRefiner {
  async refine(_req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    return fail(new UnknownFailure('errors.ai.provider_not_configured'));
  }
}
