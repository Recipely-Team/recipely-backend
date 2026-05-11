import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

export interface GenerateRecipeRequest {
  readonly userPrompt: string;
  readonly locale: string;
}

export interface GenerateRecipeResult {
  readonly recipe: GeneratedRecipeDto;
  readonly modelUsed: string;
  readonly provider: string;
}

// Port that abstracts the AI provider away from the use case. Implementations
// live in @infrastructure/ai/* and are selected at the composition root by env.
export interface IRecipeGenerator {
  generate(req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>>;
}
