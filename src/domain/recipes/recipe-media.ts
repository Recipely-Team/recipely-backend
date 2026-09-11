import type { MediaType } from '@domain/recipes/media-type';

export interface RecipeMedia {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
}
