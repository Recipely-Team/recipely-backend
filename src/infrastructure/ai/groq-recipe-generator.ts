import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  GenerateRecipeRequest,
  GenerateRecipeResult,
  IRecipeGenerator,
} from '@application/ai/ports/i-recipe-generator';
import {
  buildSystemInstruction,
  extractJsonBlock,
  GeneratedRecipeSchema,
} from '@infrastructure/ai/recipe-prompt';
import { logger } from '@presentation/server/logger';

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
          { role: 'user', content: req.userPrompt },
        ],
        response_format: { type: 'json_object' },
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
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
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
