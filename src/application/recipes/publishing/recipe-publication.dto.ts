import type { ModerationStatus } from '@domain/moderation/moderation-status';

/** Where a recipe stands after the owner asked to publish or unpublish it. */
export interface RecipePublicationDto {
  readonly isPublished: boolean;
  readonly moderationStatus: ModerationStatus;
}
