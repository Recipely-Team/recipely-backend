import type { IInstagramRecipeImporter } from '@application/ai/ports/i-instagram-recipe-importer';
import { GroqInstagramRecipeImporter } from '@infrastructure/ai/groq-instagram-recipe-importer';
import { DisabledInstagramRecipeImporter } from '@infrastructure/ai/disabled-instagram-recipe-importer';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { logger } from '@presentation/server/logger';

export interface InstagramRecipeImporterFactoryInput {
  readonly groqKeys: ApiKeyPool;
}

/**
 * Instagram import always uses Groq — Whisper for transcription, Qwen for
 * vision. `AI_PROVIDER` does not apply here.
 *
 * Takes a POOL rather than a key: the provider rate-limits per key, and a
 * worker draining a queue is exactly where a second quota earns its keep. An
 * empty pool falls back to the disabled adapter, so a box with no keys still
 * boots and reports `provider_not_configured` rather than crashing on start.
 */
export function createInstagramRecipeImporter(
  input: InstagramRecipeImporterFactoryInput,
): IInstagramRecipeImporter {
  if (input.groqKeys.size === 0) {
    logger.warn('No Groq API keys — /recipes/import disabled until at least one is set');
    return new DisabledInstagramRecipeImporter();
  }
  logger.info({ keyCount: input.groqKeys.size }, 'instagram_importer_key_pool_ready');
  return new GroqInstagramRecipeImporter({ keys: input.groqKeys });
}
