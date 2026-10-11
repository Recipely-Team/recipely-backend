import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { FridgePhoto } from '@application/fridge/ports/fridge-scanner-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type { FridgeModelInterface } from '@infrastructure/ai/fridge/fridge-model-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Groq answering a fridge prompt — the last provider in the chain.
 *
 * @remarks
 * Same contract as {@link GeminiFridgeModel}: JSON object response, and a
 * failure log that names the provider and status, never the input.
 */
export class GroqFridgeModel implements FridgeModelInterface {
  readonly provider = 'groq';

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
      const content: Groq.Chat.ChatCompletionContentPart[] = [
        { type: 'text', text: prompt },
        ...photos.map((photo): Groq.Chat.ChatCompletionContentPart => ({
          type: 'image_url',
          image_url: { url: `data:${photo.mimeType};base64,${photo.image.toString('base64')}` },
        })),
      ];
      const completion = await new Groq({ apiKey, maxRetries: 1 }).chat.completions.create({
        model: photos.length > 0 ? this.visionModel : this.textModel,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
        temperature: this.temperature,
      });
      this.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(completion.choices[0]?.message?.content ?? '');
    } catch (err) {
      logger.warn({ provider: this.provider, status: (err as { status?: unknown }).status }, 'fridge_request_failed');
      this.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.fridge.unavailable'));
    }
  }
}
