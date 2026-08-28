/**
 * Which pool of API keys a user's session is served from.
 *
 * @remarks
 * Free and paid keys are kept apart because they are different allowances with
 * different consequences. A free key that trips its quota costs nothing and
 * benches for a minute; a paid key spends money on every call, so it must never
 * absorb traffic from users who are not paying for it. Merging the two lists
 * into one round-robin would do exactly that, silently, and the bill would be
 * the first anyone heard of it.
 *
 * Defined once here so the env variable names, the pool and the caller cannot
 * drift apart (CLAUDE.md rule 5).
 */
export const AssistantKeyTier = {
  Free: 'free',
  Paid: 'paid',
} as const;

export type AssistantKeyTierType = (typeof AssistantKeyTier)[keyof typeof AssistantKeyTier];
