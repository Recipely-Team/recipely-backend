import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

export interface ImportInstagramRecipeRequest {
  readonly url: string;
  readonly locale: string;
  readonly signal?: AbortSignal;
}

export interface ImportInstagramRecipeResult {
  readonly recipe: GeneratedRecipeDto;
  readonly modelUsed: string;
  readonly provider: string;
}

export interface IInstagramRecipeImporter {
  import(req: ImportInstagramRecipeRequest): Promise<Result<ImportInstagramRecipeResult, Failure>>;
}
