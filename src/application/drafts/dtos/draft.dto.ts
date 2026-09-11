import type { DraftRecipeSnapshot, ChatMessage } from '@domain/drafts/recipe-draft';

export interface RecipeDraftDto {
  readonly id: string;
  readonly ownerId: string;
  readonly prompt: string;
  readonly snapshot: DraftRecipeSnapshot;
  readonly chatHistory: ChatMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
