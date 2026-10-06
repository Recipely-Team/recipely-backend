/**
 * The app feature flags an admin can switch remotely. Stored in
 * `feature_flags.key`; each value is the matching key of the app's own
 * `FeatureFlags` object, so the app applies an override by name.
 */
export const FeatureFlagKey = {
  InstagramAutomations: 'instagramAutomations',
} as const;

export type FeatureFlagKeyType = (typeof FeatureFlagKey)[keyof typeof FeatureFlagKey];

export const isFeatureFlagKey = (v: unknown): v is FeatureFlagKeyType =>
  (Object.values(FeatureFlagKey) as unknown[]).includes(v);
