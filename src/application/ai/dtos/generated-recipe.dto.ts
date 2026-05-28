import type { Difficulty } from '@domain/recipes/difficulty';

// Shape the AI provider must emit. Adapters in @infrastructure/ai parse the
// raw model output and return this — the use case is unaware of which
// provider produced it. `cuisine` and `category` come through as free strings
// because the AI may emit near-miss values; the use case maps them to the
// CuisineKey / RecipeCategory enums with a defensive fallback.
export interface GeneratedRecipeDto {
  readonly title: string;
  readonly cuisine: string;
  readonly category: string;
  readonly difficulty: Difficulty;
  readonly prepTimeMinutes: number;
  readonly cookTimeMinutes: number;
  readonly servings: number;
  readonly ingredients: readonly string[];
  readonly instructions: readonly string[];
  readonly tags: readonly string[];
  readonly mealType: readonly string[];
  readonly caloriesPerServing: number;
  readonly nutrition: {
    readonly protein: number;
    readonly carbs: number;
    readonly fat: number;
    readonly fiber: number;
  };
}
