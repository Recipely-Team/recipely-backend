import { GoogleGenerativeAI } from '@google/generative-ai';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type { LoadedPhoto } from '@infrastructure/ai/photo-focus/photo-image-loader';
import type { FocusVisionClientInterface } from '@infrastructure/ai/photo-focus/focus-vision-client-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface GeminiFocusVisionClientConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/** Gemini's vision call for focus detection: JSON response type, temperature zero. */
export class GeminiFocusVisionClient implements FocusVisionClientInterface {
  readonly provider = 'gemini';

  constructor(private readonly config: GeminiFocusVisionClientConfig) {}

  async ask(photo: LoadedPhoto, prompt: string): Promise<Result<string, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));

    const startedAt = Date.now();
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: this.config.model,
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      });
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inlineData: { mimeType: photo.mimeType, data: photo.bytes.toString('base64') } }],
          },
        ],
      });
      const text = result.response.text();
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(text);
    } catch (err) {
      logger.warn(
        { errMessage: err instanceof Error ? err.message : String(err), model: this.config.model },
        'gemini_photo_focus_request_failed',
      );
      this.config.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }
  }
}
