import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type { ImportModelInterface, ModelImportResult } from '@infrastructure/ai/import/import-model-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import {
  buildImportSystemInstruction,
  extractJsonBlock,
  ImportRecipeVisionSchema,
} from '@infrastructure/ai/recipe-prompt';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const PROVIDER = 'gemini';

/**
 * `gemini-flash-latest` rather than a pinned version, and deliberately.
 *
 * @remarks
 * Verified against the live API on 2026-08-08: `gemini-2.5-flash` is still
 * LISTED by `/v1beta/models` but answers `NOT_FOUND — no longer available to
 * new users`, and the 3.x flash entries are previews. A listing is not an
 * offer, so a pinned name is a time bomb that only goes off in production; the
 * `-latest` alias is the one thing Google keeps pointing at something that
 * works. The trade — the model can change under us — is the right way round for
 * an import that already tolerates a weaker answer.
 */
const IMPORT_MODEL = 'gemini-flash-latest';

/** Matches Groq's ceiling so switching provider cannot change what ffmpeg did. */
const MAX_VISION_IMAGES = 3;

/** Gemini answers a spent quota with 429, or a RESOURCE_EXHAUSTED status body. */
const isRateLimited = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  if ((err as { status?: unknown }).status === 429) return true;
  const message = err instanceof Error ? err.message : '';
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('429');
};

/**
 * Gemini's half of an import: one multimodal model for both the audio and the
 * frames.
 *
 * @remarks
 * - **Why Gemini has no separate speech model.** Groq needs Whisper for audio
 *   and qwen for vision; Gemini takes an mp3 as an inline part of an ordinary
 *   request, so `transcribe` and `extract` are the same model called twice.
 *   They stay two methods because the pipeline treats them differently — a
 *   failed transcript is survivable, a failed extraction is not.
 * - **A key per call, benched on 429**, exactly as the Groq model does. The
 *   two share the pool discipline, not the code, because the SDKs disagree
 *   about everything else.
 * - **Not the primary.** Groq runs first and Gemini answers when Groq cannot;
 *   see {@link InstagramRecipeImporter}. Nothing here assumes either position.
 */
export class GeminiImportModel implements ImportModelInterface {
  readonly provider = PROVIDER;
  readonly frameBudget = MAX_VISION_IMAGES;

  /** The key the current call is using, so a 429 can bench the right one. */
  private activeKey: string | null = null;

  constructor(private readonly keys: ApiKeyPool) {}

  canRun(): boolean {
    return this.keys.size > 0;
  }

  private client(): GoogleGenerativeAI | null {
    const key = this.keys.next();
    if (key === null) return null;
    this.activeKey = key;
    return new GoogleGenerativeAI(key);
  }

  private benchActiveKey(): void {
    if (this.activeKey !== null) this.keys.penalise(this.activeKey);
  }

  async transcribe(audioPath: string, locale: string): Promise<Result<string, Failure>> {
    const client = this.client();
    if (client === null) {
      return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(audioPath);
    } catch (err) {
      logger.error({ err }, 'instagram_import_audio_read_failed');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    try {
      const model = client.getGenerativeModel({ model: IMPORT_MODEL });
      const result = await model.generateContent([
        {
          text:
            `Transcribe the speech in this audio, in its original language (${locale} if unclear). ` +
            'Reply with the transcript only, and with nothing at all if there is no speech.',
        },
        { inlineData: { mimeType: 'audio/mpeg', data: buffer.toString('base64') } },
      ]);
      return ok(result.response.text());
    } catch (err) {
      if (isRateLimited(err)) this.benchActiveKey();
      logger.error(
        { err, errMessage: err instanceof Error ? err.message : String(err), provider: PROVIDER },
        'instagram_import_transcription_upstream_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }
  }

  async extract(
    caption: string,
    transcript: string,
    frames: readonly string[],
    locale: string,
    signal?: AbortSignal,
  ): Promise<Result<ModelImportResult, Failure>> {
    const client = this.client();
    if (client === null) {
      return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));
    }

    const textPart = [
      caption.length > 0 ? `Caption:\n${caption}` : '',
      transcript.length > 0 ? `Transcript:\n${transcript}` : '',
      'Extract the cooking recipe from the caption, transcript, and video frames above.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const images = frames.slice(0, MAX_VISION_IMAGES);

    logger.info(
      {
        model: IMPORT_MODEL,
        provider: PROVIDER,
        locale,
        frameCount: images.length,
        hasCaption: caption.length > 0,
        hasTranscript: transcript.length > 0,
      },
      'instagram_import_vision_request_start',
    );

    let rawText: string;
    try {
      const model = client.getGenerativeModel({
        model: IMPORT_MODEL,
        systemInstruction: buildImportSystemInstruction(locale),
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
      });
      const result = await model.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [
                { text: textPart },
                ...images.map((b64) => ({
                  inlineData: { mimeType: 'image/jpeg', data: b64 },
                })),
              ],
            },
          ],
        },
        ...(signal !== undefined ? [{ signal }] : []),
      );
      rawText = result.response.text();
    } catch (err) {
      if (isRateLimited(err)) this.benchActiveKey();
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          status: (err as { status?: unknown }).status,
          model: IMPORT_MODEL,
          provider: PROVIDER,
        },
        'instagram_import_vision_request_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error(
        { err, rawText: rawText.slice(0, 500), provider: PROVIDER },
        'instagram_import_vision_json_parse_failed',
      );
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    // The no-recipe signal is checked BEFORE schema validation: the prompt asks
    // for a bare {"isRecipe": false} on non-recipe content, which fails the full
    // recipe schema and would otherwise surface as "invalid response".
    const isRecipeFlag = (parsedJson as Record<string, unknown>)['isRecipe'];
    if (isRecipeFlag === false) {
      return fail(new UnprocessableFailure('errors.import.no_recipe_found'));
    }

    const validated = ImportRecipeVisionSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error(
        { issues: validated.error.issues, provider: PROVIDER },
        'instagram_import_vision_schema_mismatch',
      );
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    return ok({
      recipe: validated.data,
      modelUsed: IMPORT_MODEL,
      provider: PROVIDER,
      // The LAST keyframe: a cooking reel builds towards the finished dish, so
      // the later the frame the likelier it shows food worth putting on a card.
      coverFrameJpegBase64: frames.at(-1) ?? null,
    });
  }
}
