import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type { MealModelInterface } from '@infrastructure/ai/meal/meal-model-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Groq answering the meal prompt — the last provider in the chain.
 *
 * @remarks
 * Same contract as {@link GeminiMealModel}: JSON object response, temperature
 * zero, and a failure log that names the provider and status, never the input.
 */
export class GroqMealModel implements MealModelInterface {
  readonly provider = 'groq';

  constructor(
    private readonly keys: ApiKeyPool,
    private readonly textModel: string,
    private readonly visionModel: string,
  ) {}

  canRun(): boolean {
    return this.keys.size > 0;
  }

  async complete(prompt: string, photo?: { image: Buffer; mimeType: string }): Promise<Result<string, Failure>> {
    const apiKey = this.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable'));
    const startedAt = Date.now();
    try {
      const content: Groq.Chat.ChatCompletionContentPart[] = [{ type: 'text', text: prompt }];
      if (photo !== undefined) {
        content.push({ type: 'image_url', image_url: { url: `data:${photo.mimeType};base64,${photo.image.toString('base64')}` } });
      }
      const completion = await new Groq({ apiKey, maxRetries: 1 }).chat.completions.create({
        model: photo !== undefined ? this.visionModel : this.textModel,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
        temperature: 0,
      });
      this.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(completion.choices[0]?.message?.content ?? '');
    } catch (err) {
      logger.warn({ provider: this.provider, status: (err as { status?: unknown }).status }, 'meal_parse_request_failed');
      this.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable'));
    }
  }
}
