import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface ModerateRecipeRequest {
  readonly title: string;
  readonly ingredients: string[];
  readonly instructions: string[];
}

export type ModerationVerdict =
  | { readonly status: 'approved' }
  | { readonly status: 'rejected'; readonly reason: string };

export interface IRecipeModerator {
  moderate(req: ModerateRecipeRequest): Promise<Result<ModerationVerdict, Failure>>;
}
