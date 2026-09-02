import { ModerationStatus } from '@domain/moderation/moderation-status';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { ImageModeratorInterface, ModerateImageRequest } from '@application/ai/ports/image-moderator-interface';
import type { ModerationVerdict } from '@application/recipes/ports/recipe-moderator-interface';
import { IMAGE_MODERATION_PROMPT } from '@infrastructure/ai/image-moderation-prompt';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const ModerationResponseSchema = z.object({
  status: z.enum([ModerationStatus.Approved, ModerationStatus.Rejected]),
  reason: z.string().trim().max(120).optional(),
});

/** Said back to the user, so it names the decision and never the picture. */
const REJECTED_REASON = 'Photo flagged by moderation';

export interface GeminiImageModeratorConfig {
  /** A pool, not a key: a spent quota should cost a rotation, not the feature. */
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/**
 * Judges a photo with Gemini's vision model.
 *
 * @remarks
 * - **Temperature zero and a JSON response type**, like every other moderator
 *   here: a judgement that varies between two identical photos is not a policy.
 * - **The model's OWN safety filters are left at their defaults and are not
 *   relied on.** They block a response; they do not answer the question, and a
 *   blocked response arrives here as an unreadable answer — which this treats
 *   as a failure, never as an approval.
 */
export class GeminiImageModerator implements ImageModeratorInterface {
  constructor(private readonly config: GeminiImageModeratorConfig) {}

  async moderate(req: ModerateImageRequest): Promise<Result<ModerationVerdict, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) {
      logger.warn('gemini_image_moderation_no_key');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    const startedAt = Date.now();
    let rawText: string;
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: this.config.model,
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      });
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: IMAGE_MODERATION_PROMPT },
              { inlineData: { mimeType: req.mimeType, data: req.image.toString('base64') } },
            ],
          },
        ],
      });
      rawText = result.response.text();
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
    } catch (err) {
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          status: (err as { status?: unknown }).status,
          model: this.config.model,
        },
        'gemini_image_moderation_request_failed',
      );
      this.config.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error(
        { err, rawText: rawText.slice(0, 500), model: this.config.model },
        'gemini_image_moderation_json_parse_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    const validated = ModerationResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error(
        { issues: validated.error.issues, model: this.config.model },
        'gemini_image_moderation_schema_mismatch',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    if (validated.data.status === ModerationStatus.Approved) return ok({ status: ModerationStatus.Approved });
    return ok({ status: ModerationStatus.Rejected, reason: REJECTED_REASON });
  }
}
