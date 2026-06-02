import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type {
  RefineRecipeRequest,
  RefineRecipeResult,
  IRecipeRefiner,
} from '@application/ai/ports/i-recipe-refiner';
import {
  buildRefineSystemInstruction,
  buildRefineUserMessage,
  extractJsonBlock,
  GeneratedRecipeSchema,
} from '@infrastructure/ai/recipe-prompt';
import { logger } from '@presentation/server/logger';

const PROVIDER = 'groq';

export interface GroqRecipeRefinerConfig {
  readonly apiKey: string;
  readonly model: string;
}

export class GroqRecipeRefiner implements IRecipeRefiner {
  private readonly client: Groq;

  constructor(private readonly config: GroqRecipeRefinerConfig) {
    this.client = new Groq({ apiKey: config.apiKey });
  }

  async refine(req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    logger.info(
      { model: this.config.model, locale: req.locale, instructionLength: req.instruction.length },
      'groq_refine_request_start',
    );

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: buildRefineSystemInstruction(req.locale) },
          { role: 'user', content: buildRefineUserMessage(req.currentRecipe as Record<string, unknown>, req.instruction) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
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
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'groq_refine_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const validated = GeneratedRecipeSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'groq_refine_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    return ok({
      recipe: validated.data,
      modelUsed: this.config.model,
      provider: PROVIDER,
    });
  }
}
