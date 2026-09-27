import type { PhotoFocusDetectorInterface } from '@application/recipes/ports/photo-focus-detector-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { VisionModels } from '@infrastructure/ai/vision-models';
import { PhotoImageLoader } from '@infrastructure/ai/photo-focus/photo-image-loader';
import type { FocusVisionClientInterface } from '@infrastructure/ai/photo-focus/focus-vision-client-interface';
import { GeminiFocusVisionClient } from '@infrastructure/ai/photo-focus/gemini-focus-vision-client';
import { GroqFocusVisionClient } from '@infrastructure/ai/photo-focus/groq-focus-vision-client';
import { VisionPhotoFocusDetector } from '@infrastructure/ai/photo-focus/vision-photo-focus-detector';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface PhotoFocusDetectorFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  readonly uploadsDir: string;
  readonly baseUrl: string;
}

/**
 * Builds the focus detector from whichever providers hold keys — Gemini
 * first, Groq last — or `null` when neither does.
 *
 * `null` rather than a disabled detector: a detector that always fails would
 * make the sweep count a failure against every photo until each hit its cap,
 * and a key added next week would then find nothing left to look at.
 */
export function createPhotoFocusDetector(input: PhotoFocusDetectorFactoryInput): PhotoFocusDetectorInterface | null {
  const clients: FocusVisionClientInterface[] = [];
  if (input.geminiKeys.size > 0) {
    clients.push(new GeminiFocusVisionClient({ keys: input.geminiKeys, model: VisionModels.gemini }));
  }
  if (input.groqKeys.size > 0) {
    clients.push(new GroqFocusVisionClient({ keys: input.groqKeys, model: VisionModels.groq }));
  }
  if (clients.length === 0) {
    logger.warn('No Gemini or Groq API keys — photo focus detection disabled, crops stay centred');
    return null;
  }
  logger.info({ providers: clients.map((c) => c.provider) }, 'photo_focus_detector_ready');
  return new VisionPhotoFocusDetector(new PhotoImageLoader(input.uploadsDir, input.baseUrl), clients);
}
