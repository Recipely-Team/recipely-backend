import type { RecipeImporterInterface } from '@application/ai/ports/recipe-importer-interface';
import { createImportModels } from '@infrastructure/ai/import/create-import-models';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { YouTubeRecipeImporter } from '@infrastructure/imports/youtube/youtube-recipe-importer';

/** The YouTube importer with the same models, in the same order, as every other import. */
export function createYouTubeRecipeImporter(input: {
  youTubeApiKey: string | undefined;
  groqKeys: ApiKeyPool;
  geminiKeys: ApiKeyPool;
}): RecipeImporterInterface {
  return new YouTubeRecipeImporter(input.youTubeApiKey, createImportModels(input));
}
