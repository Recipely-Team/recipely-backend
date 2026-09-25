import sharp from 'sharp';
import { extractText, getDocumentProxy } from 'unpdf';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import type { FileRecipeReaderInterface, UploadedRecipeFile } from '@application/ai/ports/file-recipe-reader-interface';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const PDF = 'application/pdf';
/** Long enough to read a handwritten line, short enough to stay under the vision models' size limits. */
const PAGE_EDGE = 1600;
const PAGE_QUALITY = 82;
/** A recipe fits in far less; the cap keeps a 300-page PDF from filling the prompt. */
const MAX_PDF_CHARS = 20_000;
const MAX_INPUT_PIXELS = 40_000_000;
/** Tells the model what it is looking at: the import prompt was written for video. */
const PAGES_NOTE =
  'The images are photos or scans of a written recipe — a cookbook page, a handwritten card or a screenshot — in reading order, not video frames.';
const PDF_NOTE = 'The text below was extracted from a recipe document (PDF).';
const NO_RECIPE = 'errors.import.no_recipe_in_file';

/**
 * Turns photos of recipe pages, or a PDF, into a recipe with the same models
 * the video import uses.
 *
 * @remarks
 * - **Pages go in as frames.** The models already read images; a cookbook page
 *   is just a still that holds text. Each is decoded, re-encoded as a bounded
 *   JPEG and handed over in the user's order, with a note that they are pages.
 * - **A PDF is read by its text layer.** A scanned PDF has none, and says so as
 *   "no recipe in this file" — the user can photograph it instead.
 * - **Providers are tried in order** (Gemini first), and a provider that is
 *   down makes way for the next; "there is no recipe here" is an answer, not
 *   an outage, and ends the search.
 */
export class ModelFileRecipeReader implements FileRecipeReaderInterface {
  constructor(private readonly models: readonly ImportModelInterface[]) {}

  async read(req: {
    files: readonly UploadedRecipeFile[];
    locale: string;
    signal?: AbortSignal;
  }): Promise<Result<GeneratedRecipeDto, Failure>> {
    const usable = this.models.filter((model) => model.canRun());
    if (usable.length === 0) return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));

    const prepared = await this.prepare(req.files);
    if (!prepared.ok) return prepared;
    const { caption, pages } = prepared.value;

    let last: Failure | null = null;
    for (const model of usable) {
      const result = await model.extract(caption, '', pages.slice(0, model.frameBudget), req.locale, req.signal);
      if (result.ok) return ok(result.value.recipe);
      if (result.failure.messageKey === 'errors.import.no_recipe_found') return fail(new UnprocessableFailure(NO_RECIPE));
      logger.warn({ provider: model.provider, messageKey: result.failure.messageKey }, 'file_import_provider_failed');
      last = result.failure;
    }
    return fail(last ?? new ServiceUnavailableFailure('errors.ai.upstream_failed'));
  }

  private async prepare(files: readonly UploadedRecipeFile[]): Promise<Result<{ caption: string; pages: string[] }, Failure>> {
    const pdf = files.find((f) => f.mimeType === PDF);
    if (pdf !== undefined) {
      try {
        const doc = await getDocumentProxy(new Uint8Array(pdf.bytes));
        const { text } = await extractText(doc, { mergePages: true });
        const body = text.trim().slice(0, MAX_PDF_CHARS);
        if (body.length === 0) return fail(new UnprocessableFailure(NO_RECIPE));
        return ok({ caption: `${PDF_NOTE}\n\n${body}`, pages: [] });
      } catch {
        return fail(new UnprocessableFailure('errors.import.unreadable_file'));
      }
    }
    try {
      const pages = await Promise.all(
        files.map(async (f) =>
          (
            await sharp(f.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
              .rotate()
              .resize(PAGE_EDGE, PAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: PAGE_QUALITY })
              .toBuffer()
          ).toString('base64'),
        ),
      );
      return ok({ caption: PAGES_NOTE, pages });
    } catch {
      return fail(new UnprocessableFailure('errors.import.unreadable_file'));
    }
  }
}
