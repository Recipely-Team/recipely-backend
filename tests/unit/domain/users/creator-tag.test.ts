import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorTag } from '@domain/users/creator-tag';

const T0 = new Date('2026-09-01T10:00:00Z');
const T1 = new Date('2026-09-02T10:00:00Z');
const T2 = new Date('2026-09-03T10:00:00Z');

function handle(raw: string, platform: CreatorPlatform = CreatorPlatform.Instagram): CreatorHandle {
  const result = CreatorHandle.create(platform, raw);
  if (!result.ok) throw new Error('fixture handle invalid');
  return result.value;
}

function approved(raw = 'ada'): CreatorTag {
  const result = CreatorTag.request(handle(raw), T0, null).approve(T1);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

describe('CreatorTag.request', () => {
  it('starts a new claim as pending, stamped now, unreviewed', () => {
    const tag = CreatorTag.request(handle('ada'), T0, null);
    expect(tag.status).toBe(CreatorStatus.Pending);
    expect(tag.platform).toBe(CreatorPlatform.Instagram);
    expect(tag.handle).toBe('ada');
    expect(tag.requestedAt).toBe(T0);
    expect(tag.reviewedAt).toBeNull();
  });

  it('is a no-op for the same platform + handle as the approved claim', () => {
    const current = approved('ada');
    expect(CreatorTag.request(handle('@ADA'), T2, current)).toBe(current);
  });

  it('goes back to pending when the handle of an approved claim changes', () => {
    const next = CreatorTag.request(handle('ada.cooks'), T2, approved('ada'));
    expect(next.status).toBe(CreatorStatus.Pending);
    expect(next.handle).toBe('ada.cooks');
    expect(next.requestedAt).toBe(T2);
    expect(next.reviewedAt).toBeNull();
  });

  it('goes back to pending when only the platform of an approved claim changes', () => {
    const next = CreatorTag.request(handle('ada', CreatorPlatform.TikTok), T2, approved('ada'));
    expect(next.status).toBe(CreatorStatus.Pending);
    expect(next.platform).toBe(CreatorPlatform.TikTok);
  });

  it('lets a rejected claim be requested again, even unchanged', () => {
    const rejected = CreatorTag.request(handle('ada'), T0, null).reject(T1);
    if (!rejected.ok) throw new Error('unreachable');
    const again = CreatorTag.request(handle('ada'), T2, rejected.value);
    expect(again.status).toBe(CreatorStatus.Pending);
    expect(again.requestedAt).toBe(T2);
  });

  it('re-stamps a pending claim sent again', () => {
    const pending = CreatorTag.request(handle('ada'), T0, null);
    expect(CreatorTag.request(handle('ada'), T1, pending).requestedAt).toBe(T1);
  });
});

describe('CreatorTag review', () => {
  it('approve sets approved and the review time', () => {
    const tag = approved();
    expect(tag.status).toBe(CreatorStatus.Approved);
    expect(tag.isApproved).toBe(true);
    expect(tag.reviewedAt).toBe(T1);
    expect(tag.requestedAt).toBe(T0);
  });

  it('reject sets rejected and the review time', () => {
    const result = CreatorTag.request(handle('ada'), T0, null).reject(T1);
    expect(result.ok && result.value.status).toBe(CreatorStatus.Rejected);
    expect(result.ok && result.value.reviewedAt).toBe(T1);
  });

  it('refuses to review a claim that is not pending', () => {
    const tag = approved();
    for (const result of [tag.approve(T2), tag.reject(T2)]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
    }
  });
});

describe('CreatorTag.restore', () => {
  const columns = {
    status: CreatorStatus.Approved as string,
    platform: CreatorPlatform.TikTok as string | null,
    handle: 'ada_cooks' as string | null,
    requestedAt: T0 as Date | null,
    reviewedAt: T1 as Date | null,
  };

  it('reads status none as no claim', () => {
    const result = CreatorTag.restore({ status: CreatorStatus.None, platform: null, handle: null, requestedAt: null, reviewedAt: null });
    expect(result).toEqual({ ok: true, value: null });
  });

  it('rebuilds a stored claim', () => {
    const result = CreatorTag.restore(columns);
    if (!result.ok || result.value === null) throw new Error('expected a claim');
    expect(result.value.status).toBe(CreatorStatus.Approved);
    expect(result.value.platform).toBe(CreatorPlatform.TikTok);
    expect(result.value.handle).toBe('ada_cooks');
    expect(result.value.reviewedAt).toBe(T1);
  });

  it.each([
    ['an unknown status', { status: 'banana' }],
    ['an unknown platform', { platform: 'myspace' }],
    ['a missing handle', { handle: null }],
    ['a missing request time', { requestedAt: null }],
    ['a handle that breaks the rules', { handle: 'a' }],
  ])('refuses %s', (_label, override) => {
    expect(CreatorTag.restore({ ...columns, ...override }).ok).toBe(false);
  });
});
