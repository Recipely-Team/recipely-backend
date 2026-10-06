/**
 * What a remote flag row says. Stored in `feature_flags.state`.
 *
 * `Default` hands the decision back to the app's build-time value (a dev-only
 * feature stays dev-only); `On` / `Off` override it for every client.
 */
export const FeatureFlagState = {
  Default: 'default',
  On: 'on',
  Off: 'off',
} as const;

export type FeatureFlagStateType = (typeof FeatureFlagState)[keyof typeof FeatureFlagState];

export const isFeatureFlagState = (v: unknown): v is FeatureFlagStateType =>
  (Object.values(FeatureFlagState) as unknown[]).includes(v);
