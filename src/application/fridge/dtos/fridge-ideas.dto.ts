import type { FridgeIdeaDto } from '@application/fridge/dtos/fridge-idea.dto';

/** `POST /fridge/ideas`: three ideas (fewer only when moderation dropped one). */
export interface FridgeIdeasDto {
  readonly ideas: readonly FridgeIdeaDto[];
}
