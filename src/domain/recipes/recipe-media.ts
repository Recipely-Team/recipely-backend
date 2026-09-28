import type { MediaType } from '@domain/recipes/media-type';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';

export interface RecipeMedia {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
  /** Where the dish sits in this photo; absent until the focus sweep finds it. */
  readonly focus?: FocalPoint | undefined;
}
