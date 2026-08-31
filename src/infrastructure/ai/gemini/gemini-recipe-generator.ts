import { GoogleGenerativeAI } from '@google/generative-ai';
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
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const PROVIDER = 'gemini';

/** Gemini answers a spent quota with 429, or a RESOURCE_EXHAUSTED status body. */
const isRateLimited = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  if ((err as { status?: unknown }).status === 429) return true;
  const message = err instanceof Error ? err.message : '';
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('429');
};

export interface GeminiRecipeGeneratorConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/**
 * A key per call, benched on 429 — the same pool discipline the import path
 * uses, and the reason this takes a pool rather than a key.
 *
 * @remarks
 * The singular `GEMINI_API_KEY` is empty on production; the key actually
 * deployed lives in `GEMINI_API_KEYS`. A generator built from the singular var
 * would therefore never be constructed at all, and "try Gemini first" would be
 * a no-op that looked correct in the diff. The pool reads both.
 */
/**
 * How long this seat may hold the request before the next one gets a turn.
 *
 * @remarks
 * It had none, and neither did the Groq seat. So when Gemini went slow rather
 * than failing — which it did in production, taking 91 seconds for one recipe —
 * the chain waited with it, the app gave up at 90, and the user watched a
 * spinner and then an error for a request the fallback could have answered.
 * A fallback that only runs after the caller has left is not a fallback.
 *
 * 35 seconds gives both seats a turn inside the app's 90-second wait, with room
 * for the round trip. A generation that genuinely needs longer than 35 seconds
 * is one the user has already stopped waiting for.
 */
const REQUEST_TIMEOUT_MS = 35_000;

export class GeminiRecipeGenerator implements IRecipeGenerator {
  constructor(private readonly config: GeminiRecipeGeneratorConfig) {}

  async generate(req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>> {
    logger.info({ model: this.config.model, locale: req.locale, promptLength: req.userPrompt.length }, 'gemini_request_start');

    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));

    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: this.config.model,
      systemInstruction: buildSystemInstruction(req.locale),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    let rawText: string;
    const startedAt = Date.now();
    try {
      const result = await model.generateContent(
        { contents: [{ role: 'user', parts: [{ text: buildGenerateUserMessage(req.userPrompt) }] }] },
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      rawText = result.response.text();
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
    } catch (err) {
      // Bench only on a rate limit. Benching on any failure would take the pool
      // apart over a bad prompt or a network blip — see ApiKeyPool.penalise.
      // A quota benches the key; anything else only moves it down the order —
      // see ApiKeyPool.fail.
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
        'gemini_request_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'gemini_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const validated = GeneratedRecipeSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'gemini_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    return ok({
      recipe: validated.data,
      modelUsed: this.config.model,
      provider: PROVIDER,
    });
  }
}
