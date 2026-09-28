import { ImportJob } from '@domain/imports/import-job';
import { ImportJobStatus } from '@domain/imports/import-job-status';

/**
 * The job entity is the only thing standing between two workers and two drafts
 * for one request. Each test below names the user-visible symptom the rule
 * prevents, because the next person to read this is deciding whether they may
 * relax one of them.
 */

const NOW = new Date('2026-08-02T12:00:00Z');
const later = (ms: number): Date => new Date(NOW.getTime() + ms);

const queued = (): ImportJob => {
  const r = ImportJob.queue({
    id: 'job-1',
    ownerId: 'user-1',
    url: 'https://www.instagram.com/reel/abc/',
    locale: 'tr',
    now: NOW,
  });
  if (!r.ok) throw new Error('fixture failed to build');
  return r.value;
};

describe('a new job', () => {
  it('starts queued, unclaimed and unattempted', () => {
    const job = queued();

    expect(job.status).toBe(ImportJobStatus.Queued);
    expect(job.claimedBy).toBeNull();
    expect(job.attempts).toBe(0);
    expect(job.draftId).toBeNull();
    expect(job.isFinished).toBe(false);
  });

  it('carries the requester language, because the worker will never see the request', () => {
    expect(queued().locale).toBe('tr');
  });

  it('refuses to be built without an owner', () => {
    const r = ImportJob.queue({ id: 'job-1', ownerId: '  ', url: 'https://instagram.com/x', locale: 'en', now: NOW });

    expect(r.ok).toBe(false);
  });
});

describe('claiming', () => {
  it('counts the claim, not the failure — a worker that dies still used an attempt', () => {
    const r = queued().claim('worker-a', NOW);
    if (!r.ok) throw new Error('claim rejected');

    expect(r.value.attempts).toBe(1);
    expect(r.value.status).toBe(ImportJobStatus.Running);
    expect(r.value.claimedBy).toBe('worker-a');
  });

  it('leaves the original untouched, so a caller cannot report on a job it no longer holds', () => {
    const before = queued();
    before.claim('worker-a', NOW);

    expect(before.status).toBe(ImportJobStatus.Queued);
    expect(before.attempts).toBe(0);
  });
});

describe('finishing', () => {
  it('records the draft the notification will open', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');

    const done = claimed.value.complete('draft-9', later(1000));
    if (!done.ok) throw new Error('complete rejected');

    expect(done.value.status).toBe(ImportJobStatus.Done);
    expect(done.value.draftId).toBe('draft-9');
    expect(done.value.isFinished).toBe(true);
  });

  it('keeps the error key and drops any draft on failure', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');

    const failed = claimed.value.markFailed('errors.import.no_recipe_found', later(1000));
    if (!failed.ok) throw new Error('markFailed rejected');

    expect(failed.value.status).toBe(ImportJobStatus.Failed);
    expect(failed.value.errorKey).toBe('errors.import.no_recipe_found');
    expect(failed.value.draftId).toBeNull();
  });

  // The symptom this prevents: a worker whose lease expired mid-import comes
  // back after the job was re-run by someone else, and its stale result
  // overwrites the newer one — so the notification opens a draft the user never
  // saw produced, or a success is reported as a failure.
  it('refuses a second ending', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');
    const done = claimed.value.complete('draft-9', later(1000));
    if (!done.ok) throw new Error('complete rejected');

    expect(done.value.complete('draft-10', later(2000)).ok).toBe(false);
    expect(done.value.markFailed('errors.import.fetch_failed', later(2000)).ok).toBe(false);
    expect(done.value.claim('worker-b', later(2000)).ok).toBe(false);
  });

  it('refuses a completion with no draft to point at', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');

    expect(claimed.value.complete('   ', later(1000)).ok).toBe(false);
  });
});

describe('the lease', () => {
  const LEASE = 300_000;

  it('holds while the claim is fresh, so two workers never run one job', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');

    expect(claimed.value.isLeaseExpired(later(LEASE - 1), LEASE)).toBe(false);
  });

  // The symptom this prevents: a worker is killed mid-import, reports nothing,
  // and its row sits in `running` forever while the user waits for a
  // notification that is never coming.
  it('expires once the claim is older than the lease', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');

    expect(claimed.value.isLeaseExpired(later(LEASE), LEASE)).toBe(true);
  });

  it('does not apply to a job nobody is holding', () => {
    expect(queued().isLeaseExpired(later(999_999), LEASE)).toBe(false);
  });

  it('returns a released job to the queue with its attempts intact', () => {
    const claimed = queued().claim('worker-a', NOW);
    if (!claimed.ok) throw new Error('claim rejected');

    const released = claimed.value.release(later(LEASE));
    if (!released.ok) throw new Error('release rejected');

    expect(released.value.status).toBe(ImportJobStatus.Queued);
    expect(released.value.claimedBy).toBeNull();
    // Attempts must NOT be given back: a job that keeps killing workers has to
    // run out of chances, or it takes the fleet down one box at a time.
    expect(released.value.attempts).toBe(1);
  });
});

describe('where the job points', () => {
  it.each([
    ['https://vm.tiktok.com/ZMabc/', 'TIKTOK'],
    ['https://youtu.be/dQw4w9WgXcQ', 'YOUTUBE'],
    ['https://www.instagram.com/reel/abc/', 'INSTAGRAM'],
    ['https://yemek.com/tarif/menemen/', 'WEB'],
  ] as const)('%s is a %s job', (url, platform) => {
    const job = ImportJob.queue({ id: 'job-2', ownerId: 'user-1', url, locale: 'tr', now: NOW });
    expect(job.ok && job.value.sourcePlatform).toBe(platform);
  });
});
