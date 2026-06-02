import { fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  RefineRecipeRequest,
  RefineRecipeResult,
  IRecipeRefiner,
} from '@application/ai/ports/i-recipe-refiner';

// Placeholder for the Anthropic refiner adapter. The codebase deliberately avoids
// shipping the @anthropic-ai/sdk dependency until someone enables AI_PROVIDER
// =anthropic — Anthropic API is paid (no free tier), so keeping the package
// out of node_modules avoids the bundle/lockfile cost for users on Gemini.
// To activate: `npm i @anthropic-ai/sdk`, swap this body for a real client.
export class AnthropicRecipeRefiner implements IRecipeRefiner {
  constructor(
    private readonly _config: { readonly apiKey: string; readonly model: string },
  ) {
    void this._config;
  }

  async refine(_req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    return fail(new UnknownFailure('errors.ai.provider_not_configured'));
  }
}
