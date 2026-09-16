import Groq from 'groq-sdk';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  RefineRecipeRequest,
  RefineRecipeResult,
  RecipeRefinerInterface,
} from '@application/ai/ports/recipe-refiner-interface';
import {
  buildRefineSystemInstruction,
  buildRefineUserMessage,
  extractJsonBlock,
  RefinedRecipeSchema,
} from '@infrastructure/ai/recipe-prompt';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const PROVIDER = 'groq';

/**
 * Groq's answer when the model ran out of completion budget before closing the
 * JSON, or emitted nothing at all. It arrives as a 400 whose body names
 * `json_validate_failed`; the SDK surfaces the whole body in `message`.
 */
const isJsonValidationFailure = (err: unknown): boolean =>
  (err as { status?: number }).status === 400 &&
  String((err as { message?: string }).message ?? '').includes('json_validate_failed');

const TOO_MANY_REQUESTS = 429;

export interface GroqRecipeRefinerConfig {
  /** The same pool the generator draws from; see `GeminiRecipeRefinerConfig`. */
  readonly keys: ApiKeyPool;
  readonly model: string;
}

export class GroqRecipeRefiner implements RecipeRefinerInterface {
  constructor(private readonly config: GroqRecipeRefinerConfig) {}

  async refine(req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    logger.info(
      { model: this.config.model, locale: req.locale, instructionLength: req.instruction.length },
      'groq_refine_request_start',
    );

    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    const startedAt = Date.now();

    let rawText: string;
    try {
      const completion = await new Groq({ apiKey, maxRetries: 2 }).chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: buildRefineSystemInstruction(req.locale) },
          {
            role: 'user',
            content: buildRefineUserMessage(
              req.currentRecipe as Record<string, unknown>,
              req.instruction,
              req.history,
            ),
          },
        ],
        response_format: { type: 'json_object' },
        // gpt-oss is a reasoning model, and left to itself it can spend the
        // whole completion budget thinking and emit nothing — Groq then rejects
        // the empty result with `400 json_validate_failed`, which reached the
        // app as a 503 on a service that was up. Both signatures showed up in
        // dev within one hour: `failed_generation: ""` and "max completion
        // tokens reached before generating a valid document".
        //
        // Measured against a 6.3 KB recipe with a 942-character instruction, on
        // this account: 1701 completion tokens unset vs 1033 at `low`, and 6.4 s
        // vs 2.8 s. Cutting the thinking is what leaves room for the answer.
        //
        // NOT `max_completion_tokens`: Groq reserves the requested budget
        // against the account's 8000 TPM ceiling, so raising it trades this
        // failure for a rate-limit one. The import path learned that first —
        // see `groq-import-model.ts`.
        reasoning_effort: 'low',
        temperature: 0.7,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
    } catch (err) {
      // Bench only on a rate limit — the pool's own rule.
      if ((err as { status?: unknown }).status === TOO_MANY_REQUESTS) this.config.keys.penalise(apiKey);
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          errName: err instanceof Error ? err.name : undefined,
          status: (err as { status?: unknown }).status,
          model: this.config.model,
        },
        'groq_refine_request_failed',
      );
      // A model that could not produce valid JSON for THIS input is not a
      // service outage, and saying "service unavailable" told the user to wait
      // for something that was never going to change on its own. It is the one
      // upstream failure the user can act on — shorten the instruction, try
      // again — so it keeps the code that carries that message.
      if (isJsonValidationFailure(err)) {
        return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
      }
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'groq_refine_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const validated = RefinedRecipeSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'groq_refine_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const { summary, suggestion, ...recipeFields } = validated.data;
    return ok({
      recipe: recipeFields,
      modelUsed: this.config.model,
      provider: PROVIDER,
      summary,
      suggestion,
    });
  }
}
