import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  RefineRecipeRequest,
  RefineRecipeResult,
  RecipeRefinerInterface,
} from '@application/ai/ports/recipe-refiner-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Asks each provider in turn and returns the first refinement anyone produces.
 *
 * @remarks
 * The order is the factory's business, not this class's — it holds whatever it
 * is given and never assumes a position, exactly as
 * {@link FallbackRecipeGenerator} does for the other half of the same feature.
 *
 * **What counts as "could not answer"** is the generator's rule, for the
 * generator's reason: `ServiceUnavailableFailure` is the upstream being
 * unreachable or out of quota and `UnprocessableFailure` is a reply that is not
 * the agreed JSON — both are worth asking someone else about. Anything else is
 * the answer, so a refusal added to this port later is not silently retried
 * around until a provider is found that will comply.
 *
 * The failure returned when everyone fails is the LAST one, and the log above
 * it names every provider that was tried.
 */
export class FallbackRecipeRefiner implements RecipeRefinerInterface {
  constructor(private readonly refiners: readonly RecipeRefinerInterface[]) {}

  async refine(req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    let lastFailure: Failure = new ServiceUnavailableFailure('errors.ai.upstream_failed');

    for (const refiner of this.refiners) {
      const result = await refiner.refine(req);
      if (result.ok) return result;

      lastFailure = result.failure;
      if (!isProviderShortfall(result.failure)) return result;

      logger.warn(
        { refiner: refiner.constructor.name, messageKey: result.failure.messageKey },
        'recipe_refine_provider_unavailable — trying the next one',
      );
    }

    return fail(lastFailure);
  }
}

function isProviderShortfall(failure: Failure): boolean {
  return failure instanceof ServiceUnavailableFailure || failure instanceof UnprocessableFailure;
}
