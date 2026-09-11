import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import type { DraftRecipeSnapshot } from '@domain/drafts/recipe-draft';

/**
 * One earlier turn of the refine conversation, replayed so a follow-up
 * instruction can lean on it ("actually make it spicier too").
 *
 * `rejected` is what stops the replay from lying: once the client shows a
 * refinement as a proposal the cook can decline, an assistant turn describing a
 * change is no longer proof the change happened. A declined turn still belongs
 * in the history — "no, not that" is context — but it must be labelled, or the
 * model reads its own summary as an account of the current recipe.
 */
export interface RefineTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly rejected?: boolean;
}

export interface RefineRecipeRequest {
  readonly currentRecipe: DraftRecipeSnapshot;
  readonly instruction: string;
  readonly locale: string;
  readonly history: readonly RefineTurn[];
}

export interface RefineRecipeResult {
  readonly recipe: GeneratedRecipeDto;
  readonly modelUsed: string;
  readonly provider: string;
  readonly summary: string;
  readonly suggestion: string;
}

export interface RecipeRefinerInterface {
  refine(req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>>;
}
