import Groq, { toFile } from 'groq-sdk';
import fs from 'node:fs/promises';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type { ImportInstagramRecipeResult } from '@application/ai/ports/i-instagram-recipe-importer';
import type { IImportModel } from '@infrastructure/ai/import/i-import-model';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import {
  buildImportSystemInstruction,
  extractJsonBlock,
  ImportRecipeVisionSchema,
} from '@infrastructure/ai/recipe-prompt';
import { logger } from '@presentation/server/logger';

const PROVIDER = 'groq';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
// llama-4-scout was shut down by Groq on 2026-07-17; qwen3.6-27b is Groq's
// current multimodal model and supports JSON mode.
const VISION_MODEL = 'qwen/qwen3.6-27b';

/**
 * Hard ceiling on images per vision request, set by the model: qwen3.6-27b
 * rejects a 4th image with `400 Too many images provided`. That 400 became a
 * 503 at the edge, and it arrived only AFTER the download, audio extraction and
 * every keyframe had already been produced — so the user waited out the whole
 * pipeline to be told the service was unavailable.
 */
const MAX_VISION_IMAGES = 3;

/**
 * True when Groq refused the request for being too big for the account's
 * per-minute token budget — `413`, with a body like:
 *
 *   Request too large … tokens per minute (TPM): Limit 8000, Requested 10459
 *
 * That is a *size* rejection, so the same request retried unchanged fails
 * identically; only a smaller one can succeed. Deliberately narrower than
 * `code: rate_limit_exceeded`, which a plain too-many-requests 429 also carries
 * and which shedding images would not fix.
 */
const isRequestTooLarge = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 413;

/** Groq answers a spent quota with 429; `rate_limit_exceeded` also arrives as one. */
const isRateLimited = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 429;

/**
 * Groq's half of an import: Whisper for the audio, qwen3.6 for the frames.
 *
 * @remarks
 * - **One key per call, taken from the pool.** A client is built per request
 *   rather than once in the constructor: the whole point of holding several
 *   keys is that a run can use a different one from the last, and a client
 *   captured at startup would pin the process to whichever key was first for as
 *   long as it lived. The SDK client is a thin HTTP wrapper — making one costs
 *   nothing worth saving.
 * - **A 429 benches the key that earned it**, so the next call reaches for
 *   another instead of walking back into the same spent quota.
 */
export class GroqImportModel implements IImportModel {
  readonly provider = PROVIDER;
  readonly frameBudget = MAX_VISION_IMAGES;

  /** The key the current call is using, so a 429 can bench the right one. */
  private activeKey: string | null = null;

  constructor(private readonly keys: ApiKeyPool) {}

  canRun(): boolean {
    return this.keys.size > 0;
  }

  private client(): Groq | null {
    const key = this.keys.next();
    if (key === null) return null;
    this.activeKey = key;
    return new Groq({ apiKey: key });
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
      const langCode = locale.length === 2 ? locale : undefined;
      const transcription = await client.audio.transcriptions.create({
        model: WHISPER_MODEL,
        file: await toFile(buffer, 'audio.mp3', { type: 'audio/mpeg' }),
        ...(langCode !== undefined ? { language: langCode } : {}),
      });
      return ok(transcription.text ?? '');
    } catch (err) {
      if (isRateLimited(err)) this.benchActiveKey();
      logger.error(
        { err, errMessage: err instanceof Error ? err.message : String(err) },
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
  ): Promise<Result<ImportInstagramRecipeResult, Failure>> {
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

    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } };

    // Sliced again even though extraction already stopped at the budget, so
    // raising the keyframe count for some future model cannot silently bring
    // the `400 Too many images provided` back.
    const available = frames.slice(0, MAX_VISION_IMAGES);

    const requestWith = (images: string[]): ContentPart[] => [
      { type: 'text', text: textPart },
      ...images.map((b64) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    let rawText: string | undefined;
    let lastError: unknown;

    // Drop one image at a time until the request fits the account's token
    // budget, ending with a text-only attempt. Groq prices an image at a flat
    // per-image rate — measured identical for 1080p, 512px and 384px frames —
    // so shrinking the JPEGs buys nothing here and only the COUNT can give.
    // A fixed count can't be right either: the token total also carries the
    // caption and the transcript, which vary per reel, so the fit is
    // discovered per request rather than guessed at compile time.
    for (let attempt = available.length; attempt >= 0; attempt--) {
      const images = available.slice(0, attempt);

      logger.info(
        {
          model: VISION_MODEL,
          locale,
          frameCount: images.length,
          hasCaption: caption.length > 0,
          hasTranscript: transcript.length > 0,
        },
        'instagram_import_vision_request_start',
      );

      try {
        const completion = await client.chat.completions.create(
          {
            model: VISION_MODEL,
            messages: [
              { role: 'system', content: buildImportSystemInstruction(locale) },
              { role: 'user', content: requestWith(images) },
            ],
            response_format: { type: 'json_object' },
            // qwen3.6 is a reasoning model, and left to itself it spends the
            // ENTIRE completion budget thinking and never emits the answer —
            // measured: 2048 completion tokens, 0 characters of content. In
            // json_object mode Groq then rejects the empty result with
            // `400 json_validate_failed` and an empty `failed_generation`,
            // which is what an import looked like from the app: a two-minute
            // wait ending in 503. Turning thinking off produced valid JSON in
            // 599 tokens. Raising max_tokens instead does not work — the extra
            // reservation runs straight into the account's 8000 TPM ceiling.
            reasoning_effort: 'none',
            temperature: 0.3,
          },
          ...(signal !== undefined ? [{ signal }] : []),
        );
        rawText = completion.choices[0]?.message?.content ?? '';
        break;
      } catch (err) {
        lastError = err;
        if (attempt > 0 && isRequestTooLarge(err)) {
          logger.warn(
            { model: VISION_MODEL, frameCount: images.length, nextFrameCount: attempt - 1 },
            'instagram_import_vision_request_too_large_retrying',
          );
          continue;
        }
        break;
      }
    }

    if (rawText === undefined) {
      if (isRateLimited(lastError)) this.benchActiveKey();
      logger.error(
        {
          err: lastError,
          errMessage: lastError instanceof Error ? lastError.message : String(lastError),
          errName: lastError instanceof Error ? lastError.name : undefined,
          status: (lastError as { status?: unknown } | undefined)?.status,
          model: VISION_MODEL,
        },
        'instagram_import_vision_request_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      logger.error({ err, rawText: rawText.slice(0, 500) }, 'instagram_import_vision_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    // Check the no-recipe signal BEFORE full schema validation. The prompt
    // instructs the model to respond with bare {"isRecipe": false} for
    // non-recipe content — that minimal object fails the full recipe schema,
    // so we must short-circuit here to surface the correct error code.
    const isRecipeFlag = (parsedJson as Record<string, unknown>)['isRecipe'];
    if (isRecipeFlag === false) {
      return fail(new UnprocessableFailure('errors.import.no_recipe_found'));
    }

    const validated = ImportRecipeVisionSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'instagram_import_vision_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    return ok({
      recipe: validated.data,
      modelUsed: VISION_MODEL,
      provider: PROVIDER,
      // The LAST keyframe, i.e. the latest point in the clip we sampled. A
      // cooking reel builds towards the finished dish, so the later the frame
      // the likelier it shows food worth putting on a card. Free: these frames
      // were already extracted for the vision call, and on a 1 OCPU box that
      // matters — the import measured 119 s against a 120 s timeout, with no
      // room for another ffmpeg pass.
      coverFrameJpegBase64: frames.at(-1) ?? null,
    });
  }
}
