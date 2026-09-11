import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  GenerateRecipeRequest,
  GenerateRecipeResult,
  RecipeGeneratorInterface,
} from '@application/ai/ports/recipe-generator-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Asks each provider in turn and returns the first recipe anyone produces.
 *
 * @remarks
 * The order is the factory's business, not this class's — it holds whatever it
 * is given and never assumes a position, the same way
 * {@link InstagramRecipeImporter} treats its models.
 *
 * **What counts as "could not answer".** Falling through on the wrong failure
 * would be worse than not falling through at all: a second provider asked to
 * redo a request the first one legitimately refused just launders the refusal.
 * For this port the two failures both mean the provider itself came up short —
 * `ServiceUnavailableFailure` is the upstream being unreachable or out of
 * quota, and `UnprocessableFailure` is the model returning something that is
 * not the agreed JSON. Both are worth asking someone else about. Anything else
 * is treated as the answer, so a refusal added to this port later is not
 * silently retried around.
 *
 * The failure returned when everyone fails is the LAST one, not the first: it
 * is the one whose provider had the final word, and the log above it names
 * every provider that was tried.
 */
export class FallbackRecipeGenerator implements RecipeGeneratorInterface {
  constructor(private readonly generators: readonly RecipeGeneratorInterface[]) {}

  async generate(req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>> {
    let lastFailure: Failure = new ServiceUnavailableFailure('errors.ai.upstream_failed');

    for (const generator of this.generators) {
      const result = await generator.generate(req);
      if (result.ok) return result;

      lastFailure = result.failure;
      if (!isProviderShortfall(result.failure)) return result;

      logger.warn(
        { generator: generator.constructor.name, messageKey: result.failure.messageKey },
        'recipe_generation_provider_unavailable — trying the next one',
      );
    }

    return fail(lastFailure);
  }
}

function isProviderShortfall(failure: Failure): boolean {
  return failure instanceof ServiceUnavailableFailure || failure instanceof UnprocessableFailure;
}
