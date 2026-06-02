import type { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { RecipeDraftDto } from '@application/drafts/dtos/draft.dto';

export class DraftMapper {
  static toDto(draft: RecipeDraft): RecipeDraftDto {
    const raw = draft.toRaw();
    return {
      id: raw.id,
      ownerId: raw.ownerId,
      prompt: raw.prompt,
      snapshot: raw.snapshot,
      chatHistory: raw.chatHistory,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}
