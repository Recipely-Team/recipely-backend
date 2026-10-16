import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type { RecipeTranslatorInterface, TranslateRecipeInput, TranslateRecipeResult } from '@application/recipes/ports/recipe-translator-interface';

/**
 * Asks each translator in the factory's order and keeps the first answer.
 * Only an unreachable provider or a malformed reply moves on, the refiner
 * chain's rule; the last failure is returned when nobody answers.
 */
export class FallbackRecipeTranslator implements RecipeTranslatorInterface {
  constructor(private readonly translators: readonly RecipeTranslatorInterface[]) {}

  async translate(input: TranslateRecipeInput): Promise<Result<TranslateRecipeResult, Failure>> {
    let last: Failure = new ServiceUnavailableFailure('errors.ai.upstream_failed');
    for (const translator of this.translators) {
      const result = await translator.translate(input);
      if (result.ok) return result;
      last = result.failure;
      if (!(last instanceof ServiceUnavailableFailure || last instanceof UnprocessableFailure)) return result;
    }
    return fail(last);
  }
}
