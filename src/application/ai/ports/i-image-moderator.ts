import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ModerationVerdict } from '@application/recipes/ports/i-recipe-moderator';

export interface ModerateImageRequest {
  /** The processed JPEG, exactly as it will be stored if it is approved. */
  readonly image: Buffer;
  readonly mimeType: string;
}

/**
 * Looks at a photo before it is published under a recipe.
 *
 * @remarks
 * - **The text moderators cannot answer this.** `IPromptModerator` and
 *   `IRecipeModerator` read words; a photo attached to a perfectly ordinary
 *   recipe carries none. The only thing that has ever inspected an uploaded
 *   image on this platform is the Instagram importer's vision model, and that
 *   reads recipes out of frames rather than judging them.
 * - **It is asked about the PROCESSED file**, after resizing and re-encoding,
 *   because that is the artifact that would be served. Moderating the upload
 *   and storing something else is moderating a different file.
 * - **A verdict, not a score.** It shares {@link ModerationVerdict} with the
 *   text moderators so every rejection in the product reads the same way and
 *   carries a reason.
 */
export interface IImageModerator {
  moderate(req: ModerateImageRequest): Promise<Result<ModerationVerdict, Failure>>;
}
