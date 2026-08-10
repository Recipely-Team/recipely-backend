/**
 * Reads a provider's keys out of one environment variable.
 *
 * @remarks
 * Comma-separated, any number, whitespace ignored — `GROQ_API_KEYS=a, b ,c`.
 * A list rather than numbered variables (`_1`, `_2`, …) because adding the
 * fourth key must not mean editing a schema, a Compose file and a systemd unit:
 * the whole point is that the operator can paste in as many as they hold.
 *
 * Duplicates are dropped. Two copies of one key are not two quotas, and a pool
 * that believed otherwise would spend half its retries on the key that just
 * rate-limited it.
 */
export function parseApiKeys(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const key = part.trim();
    if (key.length > 0) seen.add(key);
  }
  return [...seen];
}

/** The same, across several sources, with duplicates dropped across all of them. */
export function mergeApiKeys(...sources: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const source of sources) {
    for (const key of parseApiKeys(source)) seen.add(key);
  }
  return [...seen];
}
