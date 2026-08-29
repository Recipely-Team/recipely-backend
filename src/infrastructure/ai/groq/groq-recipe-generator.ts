import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  GenerateRecipeRequest,
  GenerateRecipeResult,
  IRecipeGenerator,
} from '@application/ai/ports/i-recipe-generator';
import {
  buildGenerateUserMessage,
  buildSystemInstruction,
  extractJsonBlock,
  GeneratedRecipeSchema,
} from '@infrastructure/ai/recipe-prompt';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const PROVIDER = 'groq';

export interface GroqRecipeGeneratorConfig {
  readonly apiKey: string;
  readonly model: string;
}

// Groq adapter — OpenAI-compatible chat completions with a generous free tier,
// used where the Gemini free tier is unavailable (some regions get limit: 0).
// Same JSON contract as the other adapters (see recipe-prompt.ts). JSON mode
// (`response_format: json_object`) requires the word "JSON" somewhere in the
// prompt — buildSystemInstruction already includes it.
export class GroqRecipeGenerator implements IRecipeGenerator {
  private readonly client: Groq;

  constructor(private readonly config: GroqRecipeGeneratorConfig) {
    this.client = new Groq({ apiKey: config.apiKey });
  }

  async generate(req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>> {
    logger.info(
      { model: this.config.model, locale: req.locale, promptLength: req.userPrompt.length },
      'groq_request_start',
    );

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create({
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
    } catch (err) {
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
