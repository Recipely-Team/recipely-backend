import type { IImageModerator } from '@application/ai/ports/i-image-moderator';
import { GeminiImageModerator } from '@infrastructure/ai/gemini/gemini-image-moderator';
import { GroqImageModerator } from '@infrastructure/ai/groq/groq-image-moderator';
import { DisabledImageModerator } from '@infrastructure/ai/disabled/disabled-image-moderator';
import { FallbackImageModerator } from '@infrastructure/ai/fallback-image-moderator';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/** The vision models. Neither provider's text model can look at a photo. */
const GEMINI_VISION_MODEL = 'gemini-flash-latest';
const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

export interface ImageModeratorFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
}

/**
 * Assembles the photo check from whichever providers hold keys.
 *
 * @remarks
 * - **Gemini, then Groq** — the order the recipe generator settled on, for the
 *   reason it settled on it: one provider's spent quota should be a slower
 *   answer and not an outage. Here it matters more than there, because the
 *   thing an outage would otherwise do is let an unchecked photo through.
 * - **The models are named here, not configured.** These are the two vision
 *   models this codebase already uses for the Instagram import; a moderator
 *   pointed at a text model would answer the question without having seen the
 *   picture, which is worse than no moderator at all because it looks like one.
 * - **No keys at all disables the check and says so in the log.** That is the
 *   same choice the text moderators make: an unconfigured platform stays usable.
 *   It is not the same as a configured check that failed — see
 *   {@link FallbackImageModerator}.
 */
export function createImageModerator(input: ImageModeratorFactoryInput): IImageModerator {
  const moderators: IImageModerator[] = [];
  const providers: string[] = [];

  if (input.geminiKeys.size > 0) {
    moderators.push(new GeminiImageModerator({ keys: input.geminiKeys, model: GEMINI_VISION_MODEL }));
    providers.push('gemini');
  }
  if (input.groqKeys.size > 0) {
    moderators.push(new GroqImageModerator({ keys: input.groqKeys, model: GROQ_VISION_MODEL }));
    providers.push('groq');
  }

  if (moderators.length === 0) {
    logger.warn('No Gemini or Groq API keys — photo moderation disabled, all uploads auto-approved');
    return new DisabledImageModerator();
  }

  logger.info(
    { providers, geminiKeyCount: input.geminiKeys.size, groqKeyCount: input.groqKeys.size },
    'image_moderator_chain_ready',
  );

  // One provider needs no wrapper, exactly as in the generator factory.
  return moderators.length === 1 ? moderators[0]! : new FallbackImageModerator(moderators);
}
