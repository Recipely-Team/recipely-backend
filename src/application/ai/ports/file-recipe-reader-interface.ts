import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

/** One uploaded file, as the request carried it. */
export interface UploadedRecipeFile {
  readonly mimeType: string;
  readonly bytes: Buffer;
}

/** Reads a recipe out of photos of written pages, or a PDF. */
export interface FileRecipeReaderInterface {
  read(req: {
    readonly files: readonly UploadedRecipeFile[];
    readonly locale: string;
    readonly signal?: AbortSignal;
  }): Promise<Result<GeneratedRecipeDto, Failure>>;
}
