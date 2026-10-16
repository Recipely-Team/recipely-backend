import type { ImportReading } from '@domain/imports/import-reading';
import type { ParsedImportRecipeVision } from '@infrastructure/ai/recipe-prompt';

const SOURCE_TEXT_MAX = 4000;

const inRange = (indexes: readonly number[], length: number): number[] =>
  [...new Set(indexes)].filter((i) => i >= 0 && i < length).sort((a, b) => a - b);

/**
 * The model's own account of how sure it was, with the indexes kept inside
 * the lists they point at: a model that miscounts must not flag a line that
 * does not exist.
 */
export const modelReadingOf = (data: ParsedImportRecipeVision): ImportReading => ({
  suggested: data.suggested,
  guessedIngredients: data.suggested ? data.ingredients.map((_, i) => i) : inRange(data.guessedIngredients, data.ingredients.length),
  guessedSteps: data.suggested ? data.instructions.map((_, i) => i) : inRange(data.guessedSteps, data.instructions.length),
});

/** The reading with what the model was shown, capped so a two-hour transcript does not ride on a draft. */
export const withSourceText = (reading: ImportReading | undefined, parts: readonly string[]): ImportReading | undefined => {
  if (reading === undefined) return undefined;
  const text = parts.map((p) => p.trim()).filter((p) => p.length > 0).join('\n\n');
  return text.length === 0 ? reading : { ...reading, sourceText: text.slice(0, SOURCE_TEXT_MAX) };
};
