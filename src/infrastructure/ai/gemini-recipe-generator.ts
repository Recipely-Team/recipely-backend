import { GoogleGenerativeAI } from '@google/generative-ai';
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

const PROVIDER = 'gemini';

export interface GeminiRecipeGeneratorConfig {
  readonly apiKey: string;
  readonly model: string;
}

export class GeminiRecipeGenerator implements IRecipeGenerator {
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly config: GeminiRecipeGeneratorConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async generate(req: GenerateRecipeRequest): Promise<Result<GenerateRecipeResult, Failure>> {
    const model = this.client.getGenerativeModel({
      model: this.config.model,
      systemInstruction: buildSystemInstruction(req.locale),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    let rawText: string;
    try {
      const result = await model.generateContent(req.userPrompt);
      rawText = result.response.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'gemini_request_failed';
      logger.error({ err: message }, 'gemini_request_failed');
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
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
