import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { FridgeDietType } from '@domain/fridge/fridge-diet';

/** What the user has and wants, already validated and moderated. */
export interface FridgeIdeasQuery {
  readonly ingredients: readonly string[];
  readonly maxMinutes: number | null;
  readonly diet: FridgeDietType;
  readonly servings: number | null;
  /** Titles already shown, so the model suggests something else. */
  readonly exclude: readonly string[];
  readonly locale: string;
}

/** One dish idea as the model answered it, before the use case cleans it. */
export interface SuggestedIdea {
  readonly title: string;
  readonly summary: string;
  readonly totalMinutes: number;
  readonly difficulty: Difficulty;
  readonly uses: readonly string[];
  readonly missing: readonly string[];
}

/**
 * Suggests dishes from what is in the fridge — titles and summaries only; the
 * app turns a chosen one into a recipe through `POST /recipes/generate`.
 */
export interface FridgeIdeaGeneratorInterface {
  suggest(query: FridgeIdeasQuery): Promise<Result<readonly SuggestedIdea[], Failure>>;
}
