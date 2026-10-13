/**
 * The symptom: users' import requests sat in the production queue for weeks —
 * no worker served it — and nobody knew, because the app only said "importing".
 * The backend now emails the team when a request waits past the threshold.
 */
import { ok } from '@core/result/result';
import type { ImportJobRepositoryInterface, WaitingImportJobs } from '@domain/imports/import-job-repository-interface';
import { AlertWaitingImportJobsUseCase } from '@application/imports/use-cases/alert-waiting-import-jobs-use-case';

const MINUTE = 60_000;
const START = new Date('2026-10-13T12:00:00Z');

const setup = () => {
  let waiting: WaitingImportJobs = { count: 0, oldestSince: null };
  let now = START;
  const jobs = { findWaitingSince: jest.fn(async () => ok(waiting)) } as unknown as ImportJobRepositoryInterface;
  const importsWaiting = jest.fn().mockResolvedValue(undefined);
  const useCase = new AlertWaitingImportJobsUseCase(jobs, { importsWaiting }, { waitMinutes: 10, repeatMinutes: 60 }, () => now);
  return {
    useCase,
    importsWaiting,
    jobs,
    waitingSince: (minutesAgo: number, count = 1) => {
      waiting = { count, oldestSince: new Date(now.getTime() - minutesAgo * MINUTE) };
    },
    clear: () => {
      waiting = { count: 0, oldestSince: null };
    },
    advance: (minutes: number) => {
      now = new Date(now.getTime() + minutes * MINUTE);
    },
  };
};

describe('AlertWaitingImportJobsUseCase', () => {
  it('stays quiet while nothing waits', async () => {
    const t = setup();

    await t.useCase.execute();

    expect(t.importsWaiting).not.toHaveBeenCalled();
  });

  it('asks for requests untouched for longer than the threshold', async () => {
    const t = setup();

    await t.useCase.execute();

    expect(t.jobs.findWaitingSince).toHaveBeenCalledWith(new Date(START.getTime() - 10 * MINUTE));
  });

  it('emails once when requests wait, with how many and for how long', async () => {
    const t = setup();
    t.waitingSince(25, 3);

    await t.useCase.execute();

    expect(t.importsWaiting).toHaveBeenCalledWith({ count: 3, oldestWaitMinutes: 25 });
  });

  it('does not email the same incident again within the hour, then reminds', async () => {
    const t = setup();
    t.waitingSince(15);
    await t.useCase.execute();
    t.advance(30);
    await t.useCase.execute();
    expect(t.importsWaiting).toHaveBeenCalledTimes(1);

    t.advance(30);
    await t.useCase.execute();

    expect(t.importsWaiting).toHaveBeenCalledTimes(2);
  });

  it('alerts at once on a new incident after the queue recovered', async () => {
    const t = setup();
    t.waitingSince(15);
    await t.useCase.execute();
    t.clear();
    t.advance(5);
    await t.useCase.execute();
    t.waitingSince(12);
    t.advance(5);

    await t.useCase.execute();

    expect(t.importsWaiting).toHaveBeenCalledTimes(2);
  });
});
