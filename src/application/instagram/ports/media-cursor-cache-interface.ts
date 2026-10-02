/**
 * Where each page of a user's Instagram media starts, remembered between
 * requests: `undefined` is unknown, `null` is "no such page".
 */
export interface MediaCursorCacheInterface {
  get(key: string): string | null | undefined;
  set(key: string, cursor: string | null): void;
}
