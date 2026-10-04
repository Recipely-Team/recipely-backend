/**
 * Whether a linked Instagram account can still be acted for. Stored in
 * `instagram_connections.status`. `Expired` means the long-lived token lapsed
 * or Instagram refused it — the owner reconnects to fix it.
 */
export const InstagramConnectionStatus = {
  Active: 'active',
  Expired: 'expired',
} as const;

export type InstagramConnectionStatusType = (typeof InstagramConnectionStatus)[keyof typeof InstagramConnectionStatus];

export const isInstagramConnectionStatus = (v: unknown): v is InstagramConnectionStatusType =>
  (Object.values(InstagramConnectionStatus) as unknown[]).includes(v);
