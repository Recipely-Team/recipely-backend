import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { PhotoFocusDetectorInterface } from '@application/recipes/ports/photo-focus-detector-interface';
import type { PhotoImageLoader } from '@infrastructure/ai/photo-focus/photo-image-loader';
import type { FocusVisionClientInterface } from '@infrastructure/ai/photo-focus/focus-vision-client-interface';
import { PHOTO_FOCUS_PROMPT } from '@infrastructure/ai/photo-focus/photo-focus-prompt';
import { parsePhotoFocusResponse } from '@infrastructure/ai/photo-focus/photo-focus-response';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Detects a photo's focal point with the first vision provider that answers.
 *
 * @remarks
 * - **The photo is loaded once**, then offered to each provider in the order
 *   the factory gave them (Gemini first, Groq last).
 * - **An unreadable reply falls through too.** Unlike a moderation verdict
 *   there is nothing to shop for here — any readable point is as good as the
 *   next — so a provider that answered badly is treated like one that did not
 *   answer.
 * - **An image that cannot be loaded fails without a model call.**
 */
export class VisionPhotoFocusDetector implements PhotoFocusDetectorInterface {
  constructor(
    private readonly loader: PhotoImageLoader,
    private readonly clients: readonly FocusVisionClientInterface[],
  ) {}

  async detect(imageUrl: string): Promise<Result<FocalPoint, Failure>> {
    const photo = await this.loader.load(imageUrl);
    if (!photo.ok) return photo;

    let last: Failure = new ServiceUnavailableFailure('errors.ai.provider_not_configured');
    for (const client of this.clients) {
      const raw = await client.ask(photo.value, PHOTO_FOCUS_PROMPT);
      const point = raw.ok ? parsePhotoFocusResponse(raw.value) : raw;
      if (point.ok) return point;
      last = point.failure;
      logger.warn({ provider: client.provider, messageKey: last.messageKey }, 'photo_focus_provider_no_answer');
    }
    return fail(last);
  }
}
