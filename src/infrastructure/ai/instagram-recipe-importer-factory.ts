import type { RecipeImporterInterface } from '@application/ai/ports/recipe-importer-interface';
import { DisabledInstagramRecipeImporter } from '@infrastructure/ai/disabled/disabled-instagram-recipe-importer';
import { GeminiImportModel } from '@infrastructure/ai/import/gemini-import-model';
import { GroqImportModel } from '@infrastructure/ai/import/groq-import-model';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import { InstagramRecipeImporter } from '@infrastructure/ai/import/instagram-recipe-importer';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface InstagramRecipeImporterFactoryInput {
  readonly groqKeys: ApiKeyPool;
  readonly geminiKeys: ApiKeyPool;
}

/**
 * Assembles the import pipeline from whichever providers hold keys.
 *
 * @remarks
 * - **Order is Gemini, then Groq.** Gemini's free tier is the larger of the two
 *   and it reads audio and frames with one model, so it is asked first and Groq
 *   is what answers when Gemini is out of quota. Groq keeps the fallback seat
 *   rather than being retired: the pipeline's measured workarounds — the image
 *   ceiling, the token shedding, the `reasoning_effort` fix — are facts about
 *   ITS models, so it remains the path that is known to work when the other is
 *   unavailable.
 * - **`AI_PROVIDER` does not apply.** That setting picks the generator for
 *   /generate; an import uses everything it has, because the alternative to a
 *   second provider is a queue that stops.
 * - **No keys at all is still a boot.** The disabled adapter reports
 *   `provider_not_configured` rather than the process refusing to start, so a
 *   fresh box comes up and says what it is missing.
 */
export function createInstagramRecipeImporter(
  input: InstagramRecipeImporterFactoryInput,
): RecipeImporterInterface {
  const models: ImportModelInterface[] = [];
  if (input.geminiKeys.size > 0) models.push(new GeminiImportModel(input.geminiKeys));
  if (input.groqKeys.size > 0) models.push(new GroqImportModel(input.groqKeys));

  if (models.length === 0) {
    logger.warn('No Groq or Gemini API keys — /recipes/import disabled until at least one is set');
    return new DisabledInstagramRecipeImporter();
  }

  logger.info(
    {
      providers: models.map((model) => model.provider),
      groqKeyCount: input.groqKeys.size,
      geminiKeyCount: input.geminiKeys.size,
    },
    'instagram_importer_key_pool_ready',
  );
  return new InstagramRecipeImporter({ models });
}
