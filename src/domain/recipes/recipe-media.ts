export type MediaType = 'image' | 'video';

export const isMediaType = (s: string): s is MediaType => s === 'image' || s === 'video';

export interface RecipeMedia {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
}
