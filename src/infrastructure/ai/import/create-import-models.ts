import { GeminiImportModel } from '@infrastructure/ai/import/gemini-import-model';
import { GroqImportModel } from '@infrastructure/ai/import/groq-import-model';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';

/**
 * The import models that hold keys, in the order every import asks them:
 * Gemini first, Groq as the fallback.
 *
 * @remarks
 * One definition for the video, file and YouTube imports alike — the order was
 * written out in each factory, and a copy is the one that drifts.
 */
export function createImportModels(input: { groqKeys: ApiKeyPool; geminiKeys: ApiKeyPool }): ImportModelInterface[] {
  const models: ImportModelInterface[] = [];
  if (input.geminiKeys.size > 0) models.push(new GeminiImportModel(input.geminiKeys));
  if (input.groqKeys.size > 0) models.push(new GroqImportModel(input.groqKeys));
  return models;
}
