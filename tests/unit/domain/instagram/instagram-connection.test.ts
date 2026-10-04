import { connection, NOW } from '../../fixtures/instagram-fakes';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe('InstagramConnection', () => {
  it('is usable while active and unexpired', () => {
    expect(connection().isUsable(NOW)).toBe(true);
    expect(connection({ tokenExpiresAt: NOW }).isUsable(NOW)).toBe(false);
    expect(connection({ status: InstagramConnectionStatus.Expired }).isUsable(NOW)).toBe(false);
  });

  it('needs a refresh with under 7 days left, but never under a day old', () => {
    expect(connection({ tokenExpiresAt: at(6) }).needsRefresh(NOW)).toBe(true);
    expect(connection({ tokenExpiresAt: at(8) }).needsRefresh(NOW)).toBe(false);
    expect(connection({ tokenExpiresAt: at(6), refreshedAt: at(-0.5) }).needsRefresh(NOW)).toBe(false);
  });

  it('refreshes to a new token and expiry, active again', () => {
    const next = connection({ status: InstagramConnectionStatus.Expired }).refreshed('t2', at(60), NOW);
    expect([next.accessToken, next.tokenExpiresAt, next.refreshedAt, next.status]).toEqual(['t2', at(60), NOW, 'active']);
  });

  it('expires', () => {
    expect(connection().expired().status).toBe('expired');
  });
});
