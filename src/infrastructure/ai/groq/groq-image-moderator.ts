import { z } from 'zod';
import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { IImageModerator, ModerateImageRequest } from '@application/ai/ports/i-image-moderator';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';
import { IMAGE_MODERATION_PROMPT } from '@infrastructure/ai/image-moderation-prompt';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const ModerationResponseSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(120).optional(),
});

/** Said back to the user, so it names the decision and never the picture. */
const REJECTED_REASON = 'Photo flagged by moderation';

export interface GroqImageModeratorConfig {
  /**
   * A pool, not a key — the same arrangement the generators use.
   *
   * Vision calls are the expensive kind, and a single key running out of quota
   * is what took the typed assistant down for a day. Rotating across whatever
   * the operator holds costs nothing to build here.
   */
  readonly keys: ApiKeyPool;
  /** A vision model — the text models answer this question by guessing. */
  readonly model: string;
}

/**
 * Judges a photo with Groq's vision model.
 *
 * The second opinion rather than the first: it exists so that a Gemini quota
 * running out does not leave uploads unchecked. See {@link FallbackImageModerator}
 * for why an unavailable moderator must never become an approval.
 */
export class GroqImageModerator implements IImageModerator {
  constructor(private readonly config: GroqImageModeratorConfig) {}

  async moderate(req: ModerateImageRequest): Promise<Result<ModerationVerdict, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) {
      logger.warn('groq_image_moderation_no_key');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    const startedAt = Date.now();
    let rawText: string;
    try {
      const completion = await new Groq({ apiKey }).chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: IMAGE_MODERATION_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${req.mimeType};base64,${req.image.toString('base64')}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
    } catch (err) {
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          status: (err as { status?: unknown }).status,
          model: this.config.model,
        },
        'groq_image_moderation_request_failed',
      );
      this.config.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    return readVerdict(rawText, this.config.model);
  }
}

/**
 * Turns the model's answer into a verdict, or into a failure.
 *
 * An unreadable answer is a FAILURE and never an approval: "I could not tell"
 * and "there is nothing wrong with it" are different sentences, and only one of
 * them may put a photo on the site.
 */
function readVerdict(rawText: string, model: string): Result<ModerationVerdict, Failure> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonBlock(rawText));
  } catch (err) {
    logger.error({ err, rawText: rawText.slice(0, 500), model }, 'image_moderation_json_parse_failed');
    return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }

  const validated = ModerationResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    logger.error({ issues: validated.error.issues, model }, 'image_moderation_schema_mismatch');
    return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }

  if (validated.data.status === 'approved') return ok({ status: 'approved' });
  return ok({ status: 'rejected', reason: REJECTED_REASON });
}
