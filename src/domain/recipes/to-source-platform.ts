import { SourcePlatform, type SourcePlatformType } from '@domain/recipes/source-platform';

const KNOWN: ReadonlySet<string> = new Set(Object.values(SourcePlatform));

/**
 * The platform a stored value names, or `null` for anything this build has no
 * word for.
 *
 * A server that grows a third platform must not make an older client draw a
 * mark it cannot name — the recipe is still imported, it just does not say
 * from where, which is the honest reading of a value we do not understand.
 */
export const toSourcePlatform = (raw: string | null | undefined): SourcePlatformType | null =>
  typeof raw === 'string' && KNOWN.has(raw) ? (raw as SourcePlatformType) : null;
