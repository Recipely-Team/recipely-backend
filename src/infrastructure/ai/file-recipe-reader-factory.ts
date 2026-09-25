import type { FileRecipeReaderInterface } from '@application/ai/ports/file-recipe-reader-interface';
import { GeminiImportModel } from '@infrastructure/ai/import/gemini-import-model';
import { GroqImportModel } from '@infrastructure/ai/import/groq-import-model';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import { ModelFileRecipeReader } from '@infrastructure/ai/import/model-file-recipe-reader';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';

/** The same providers, in the same order (Gemini first), as the video import. */
export function createFileRecipeReader(input: { groqKeys: ApiKeyPool; geminiKeys: ApiKeyPool }): FileRecipeReaderInterface {
  const models: ImportModelInterface[] = [];
  if (input.geminiKeys.size > 0) models.push(new GeminiImportModel(input.geminiKeys));
  if (input.groqKeys.size > 0) models.push(new GroqImportModel(input.groqKeys));
  return new ModelFileRecipeReader(models);
}
