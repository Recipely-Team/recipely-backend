import type { FileRecipeReaderInterface } from '@application/ai/ports/file-recipe-reader-interface';
import { createImportModels } from '@infrastructure/ai/import/create-import-models';
import { ModelFileRecipeReader } from '@infrastructure/ai/import/model-file-recipe-reader';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';

/** The same providers, in the same order (Gemini first), as the video import. */
export function createFileRecipeReader(input: { groqKeys: ApiKeyPool; geminiKeys: ApiKeyPool }): FileRecipeReaderInterface {
  return new ModelFileRecipeReader(createImportModels(input));
}
