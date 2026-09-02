import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { NutritionCalculatorInterface, NutritionInput, NutritionResult } from '@application/ai/ports/nutrition-calculator-interface';

export class DisabledNutritionCalculator implements NutritionCalculatorInterface {
  async calculate(_input: NutritionInput): Promise<Result<NutritionResult, Failure>> {
    return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
  }
}
