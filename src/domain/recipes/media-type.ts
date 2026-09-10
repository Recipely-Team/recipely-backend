export type MediaType = 'image' | 'video';

export const isMediaType = (s: string): s is MediaType => s === 'image' || s === 'video';
