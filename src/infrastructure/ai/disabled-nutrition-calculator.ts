import { fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { INutritionCalculator, NutritionInput, NutritionResult } from '@application/ai/ports/i-nutrition-calculator';

export class DisabledNutritionCalculator implements INutritionCalculator {
  async calculate(_input: NutritionInput): Promise<Result<NutritionResult, Failure>> {
    return fail(new UnknownFailure('errors.ai.provider_not_configured'));
  }
}
