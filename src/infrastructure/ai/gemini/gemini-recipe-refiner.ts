import { GoogleGenerativeAI } from '@google/generative-ai';
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

const PROVIDER = 'gemini';
const TOO_MANY_REQUESTS = 429;

export interface GeminiRecipeRefinerConfig {
  /**
   * The same pool the generator draws from, for the same reasons: the deployed
   * key lives in `GEMINI_API_KEYS`, the singular var is empty on production, and
   * a client built once in a constructor can never rotate off a spent key.
   */
  readonly keys: ApiKeyPool;
  readonly model: string;
}

export class GeminiRecipeRefiner implements RecipeRefinerInterface {
  constructor(private readonly config: GeminiRecipeRefinerConfig) {}

  async refine(req: RefineRecipeRequest): Promise<Result<RefineRecipeResult, Failure>> {
    logger.info({ model: this.config.model, locale: req.locale, instructionLength: req.instruction.length }, 'gemini_refine_request_start');

    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    const startedAt = Date.now();

    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: this.config.model,
      systemInstruction: buildRefineSystemInstruction(req.locale),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    let rawText: string;
    try {
      const result = await model.generateContent(
        buildRefineUserMessage(req.currentRecipe as Record<string, unknown>, req.instruction, req.history),
      );
      rawText = result.response.text();
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
    } catch (err) {
      // Bench only on a rate limit, the same rule the generator follows: a bad
      // prompt or a network blip must not take the pool apart.
      if (isRateLimit(err)) this.config.keys.penalise(apiKey);
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          errName: err instanceof Error ? err.name : undefined,
          status: (err as { status?: unknown }).status,
          model: this.config.model,
        },
        'gemini_refine_request_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'gemini_refine_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const validated = RefinedRecipeSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'gemini_refine_schema_mismatch');
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

function isRateLimit(err: unknown): boolean {
  const status = (err as { status?: unknown }).status;
  return status === TOO_MANY_REQUESTS;
}
