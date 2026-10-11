import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { DetectedIngredient, FridgePhoto, FridgeScannerInterface } from '@application/fridge/ports/fridge-scanner-interface';
import type {
  FridgeIdeaGeneratorInterface,
  FridgeIdeasQuery,
  SuggestedIdea,
} from '@application/fridge/ports/fridge-idea-generator-interface';
import type { FridgeModelInterface } from '@infrastructure/ai/fridge/fridge-model-interface';
import { buildFridgeIdeasPrompt, buildFridgeScanPrompt } from '@infrastructure/ai/fridge/fridge-prompts';
import { readFridgeIdeasResponse, readFridgeScanResponse } from '@infrastructure/ai/fridge/read-fridge-responses';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Asks each provider in order until one answers readably — the shared loop of
 * the fridge scanner and the idea generator.
 *
 * @remarks
 * - **Order is the factory's** (Gemini first, Groq last).
 * - **A garbled answer is an outage of that provider**, not an empty fridge:
 *   the next one is asked. Every provider failing is a 503 with
 *   `errors.fridge.unavailable`.
 */
export class ModelFridgeChain implements FridgeScannerInterface, FridgeIdeaGeneratorInterface {
  constructor(private readonly models: readonly FridgeModelInterface[]) {}

  scan(req: { photos: readonly FridgePhoto[]; locale: string }): Promise<Result<readonly DetectedIngredient[], Failure>> {
    return this.ask(buildFridgeScanPrompt(req.locale), req.photos, readFridgeScanResponse);
  }

  suggest(query: FridgeIdeasQuery): Promise<Result<readonly SuggestedIdea[], Failure>> {
    return this.ask(buildFridgeIdeasPrompt(query), [], readFridgeIdeasResponse);
  }

  private async ask<T>(
    prompt: string,
    photos: readonly FridgePhoto[],
    read: (raw: string) => Result<T, Failure>,
  ): Promise<Result<T, Failure>> {
    const usable = this.models.filter((model) => model.canRun());
    if (usable.length === 0) return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
    let last: Failure = new ServiceUnavailableFailure('errors.fridge.unavailable');
    for (const model of usable) {
      const answer = await model.complete(prompt, photos);
      const parsed = answer.ok ? read(answer.value) : answer;
      if (parsed.ok) return parsed;
      logger.warn({ provider: model.provider, messageKey: parsed.failure.messageKey }, 'fridge_provider_failed');
      last = parsed.failure;
    }
    return fail(last);
  }
}
