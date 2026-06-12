import type { IInstagramRecipeImporter } from '@application/ai/ports/i-instagram-recipe-importer';
import { GroqInstagramRecipeImporter } from '@infrastructure/ai/groq-instagram-recipe-importer';
import { DisabledInstagramRecipeImporter } from '@infrastructure/ai/disabled-instagram-recipe-importer';
import { logger } from '@presentation/server/logger';

export interface InstagramRecipeImporterFactoryInput {
  readonly groqApiKey?: string | undefined;
}

// Instagram import always uses Groq — Whisper for transcription,
// llama-4-scout-17b for vision. AI_PROVIDER does not apply here.
// Falls back to the disabled adapter when GROQ_API_KEY is absent.
export function createInstagramRecipeImporter(
  input: InstagramRecipeImporterFactoryInput,
): IInstagramRecipeImporter {
  if (!input.groqApiKey || input.groqApiKey.trim().length === 0) {
    logger.warn(
      'GROQ_API_KEY is empty — /recipes/import disabled until key is set',
    );
    return new DisabledInstagramRecipeImporter();
  }
  return new GroqInstagramRecipeImporter({ apiKey: input.groqApiKey });
}
