import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  GenerateRecipeRequest,
  GenerateRecipeResult,
  RecipeGeneratorInterface,
} from '@application/ai/ports/recipe-generator-interface';
import {
  buildGenerateUserMessage,
  buildSystemInstruction,
  extractJsonBlock,
  GeneratedRecipeSchema,
} from '@infrastructure/ai/recipe-prompt';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const PROVIDER = 'groq';

/** Groq answers a spent quota with a 429 on the SDK error. */
const isRateLimited = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 429;

export interface GroqRecipeGeneratorConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

// Groq adapter — OpenAI-compatible chat completions with a generous free tier,
// used where the Gemini free tier is unavailable (some regions get limit: 0).
// Same JSON contract as the other adapters (see recipe-prompt.ts). JSON mode
// (`response_format: json_object`) requires the word "JSON" somewhere in the
// prompt — buildSystemInstruction already includes it.
/**
 * The second seat's share of the wait.
 *
 * Bounded for the same reason the first one is: the app waits 90 seconds, and
 * two unbounded seats can spend all of it between them without either
 * answering. This is the last seat, so it gets the rest of the budget.
 */
const REQUEST_TIMEOUT_MS = 35_000;

export class GroqRecipeGenerator implements RecipeGeneratorInterface {
  constructor(private readonly config: GroqRecipeGeneratorConfig) {}

  async generate(req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>> {
    logger.info(
      { model: this.config.model, locale: req.locale, promptLength: req.userPrompt.length },
      'groq_request_start',
    );

    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));

    let rawText: string;
    try {
      const startedAt = Date.now();
      const completion = await new Groq({ apiKey, timeout: REQUEST_TIMEOUT_MS }).chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: buildSystemInstruction(req.locale) },
          { role: 'user', content: buildGenerateUserMessage(req.userPrompt) },
        ],
        response_format: { type: 'json_object' },
        // Third place with the same lesson, so it is worth stating plainly: a
        // reasoning model with no ceiling on its thinking can spend the whole
        // completion budget and emit nothing, and Groq rejects the empty result
        // in json_object mode. The import path found it, the refiner found it
        // again, and generate had the same gap — a long, detailed brief is
        // exactly the input that provokes it.
        //
        // NOT `max_completion_tokens`: Groq reserves the requested budget
        // against the account's 8000 TPM ceiling, which trades this failure for
        // a rate-limit one. Measured on the refine path: 1701 completion tokens
        // unset vs 1033 at `low`.
        reasoning_effort: 'low',
        temperature: 0.7,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
    } catch (err) {
      // Bench only on a rate limit. Benching on any failure would take the pool
      // apart over a bad prompt or a network blip — see ApiKeyPool.penalise.
      if (isRateLimited(err)) this.config.keys.penalise(apiKey);
      else this.config.keys.fail(apiKey);
      // Capture the full error structure — non-Error rejections, status codes
      // on SDK errors, and any nested response payload all matter for diagnosis.
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          errName: err instanceof Error ? err.name : undefined,
          status: (err as { status?: unknown }).status,
          model: this.config.model,
        },
        'groq_request_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'groq_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const validated = GeneratedRecipeSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'groq_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    return ok({
      recipe: validated.data,
      modelUsed: this.config.model,
      provider: PROVIDER,
    });
  }
}
