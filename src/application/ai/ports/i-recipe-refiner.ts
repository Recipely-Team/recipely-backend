import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import type { DraftRecipeSnapshot } from '@domain/drafts/recipe-draft';

export interface RefineRecipeRequest {
  readonly currentRecipe: DraftRecipeSnapshot;
  readonly instruction: string;
  readonly locale: string;
}

export interface RefineRecipeResult {
  readonly recipe: GeneratedRecipeDto;
  readonly modelUsed: string;
  readonly provider: string;
}

export interface IRecipeRefiner {
  refine(req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>>;
}
