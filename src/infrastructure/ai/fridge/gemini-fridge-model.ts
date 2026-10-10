import { GoogleGenerativeAI } from '@google/generative-ai';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { FridgePhoto } from '@application/fridge/ports/fridge-scanner-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type { FridgeModelInterface } from '@infrastructure/ai/fridge/fridge-model-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Gemini answering a fridge prompt — the vision model for photos, the text
 * model for ideas.
 *
 * @remarks
 * JSON response type. A failure logs the provider and the HTTP status only:
 * the prompt holds what is in someone's kitchen.
 */
export class GeminiFridgeModel implements FridgeModelInterface {
  readonly provider = 'gemini';

  constructor(
    private readonly keys: ApiKeyPool,
    private readonly textModel: string,
    private readonly visionModel: string,
    private readonly temperature: number,
  ) {}

  canRun(): boolean {
    return this.keys.size > 0;
  }

  async complete(prompt: string, photos: readonly FridgePhoto[]): Promise<Result<string, Failure>> {
    const apiKey = this.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.fridge.unavailable'));
    const startedAt = Date.now();
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: photos.length > 0 ? this.visionModel : this.textModel,
        generationConfig: { responseMimeType: 'application/json', temperature: this.temperature },
      });
      const parts = [
        { text: prompt },
        ...photos.map((photo) => ({ inlineData: { mimeType: photo.mimeType, data: photo.image.toString('base64') } })),
      ];
      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const text = result.response.text();
      this.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(text);
    } catch (err) {
      logger.warn({ provider: this.provider, status: (err as { status?: unknown }).status }, 'fridge_request_failed');
      this.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.fridge.unavailable'));
    }
  }
}
