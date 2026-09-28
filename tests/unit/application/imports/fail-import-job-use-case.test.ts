import { FailImportJobUseCase } from '@application/imports/use-cases/fail-import-job-use-case';
import { ImportJob } from '@domain/imports/import-job';
import { ok } from '@core/result/result';

/**
 * A failed import's in-app row names the platform the link pointed at, so it
 * does not fall back to the Instagram mark every import row used to show. The
 * body stays platform-neutral: nothing was extracted, so there is nothing to
 * attribute.
 */

const WORKER = 'worker-a';

function build(url: string) {
  const queued = ImportJob.queue({ id: 'job-1', ownerId: 'user-1', url, locale: 'tr', now: new Date('2026-09-28T12:00:00Z') });
  if (!queued.ok) throw new Error('fixture failed');
  const claimed = queued.value.claim(WORKER, new Date('2026-09-28T12:00:01Z'));
  if (!claimed.ok) throw new Error('fixture failed');

  const jobs = {
    getById: jest.fn().mockResolvedValue(ok(claimed.value)),
    save: jest.fn(async (j: ImportJob) => ok(j)),
  };
  const notify = jest.fn().mockResolvedValue(undefined);
  const ts = { t: jest.fn((key: string) => key) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const useCase = new FailImportJobUseCase(jobs as never, { notify } as never, ts as never, logger as never);
  return { useCase, notify };
}

describe('a failed import notification', () => {
  it('every import notification showed the Instagram logo — a failed TikTok import is stored as TikTok', async () => {
    const h = build('https://www.tiktok.com/@chef/video/7412345678901234567');

    await h.useCase.execute({ jobId: 'job-1', workerId: WORKER, errorKey: 'errors.import.failed' });

    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePlatform: 'TIKTOK', body: 'notifications.import.failed.body' }),
    );
  });
});
