import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type { LoadedPhoto } from '@infrastructure/ai/photo-focus/photo-image-loader';
import type { FocusVisionClientInterface } from '@infrastructure/ai/photo-focus/focus-vision-client-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface GroqFocusVisionClientConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/**
 * Groq's vision call for focus detection, the last provider in the chain.
 *
 * Reasoning is switched off, as in the import model: left to think, the model
 * spends its budget reasoning about a two-number answer.
 */
export class GroqFocusVisionClient implements FocusVisionClientInterface {
  readonly provider = 'groq';

  constructor(private readonly config: GroqFocusVisionClientConfig) {}

  async ask(photo: LoadedPhoto, prompt: string): Promise<Result<string, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));

    const startedAt = Date.now();
    try {
      const completion = await new Groq({ apiKey, maxRetries: 1 }).chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${photo.mimeType};base64,${photo.bytes.toString('base64')}` } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'none',
        temperature: 0,
      });
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(completion.choices[0]?.message?.content ?? '');
    } catch (err) {
      logger.warn(
        { errMessage: err instanceof Error ? err.message : String(err), model: this.config.model },
        'groq_photo_focus_request_failed',
      );
      this.config.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }
  }
}
