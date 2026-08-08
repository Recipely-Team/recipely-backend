/**
 * What a client is told when it asks where its import has got to.
 *
 * The queue position is the interesting part: it is the only field here that is
 * a fact about the QUEUE rather than about the job, so it is computed at read
 * time and has to be right about when it does not exist.
 */

import { ok, fail } from '@core/result/result';
import { NotFoundFailure, UnknownFailure } from '@core/failure';
import { ImportJob } from '@domain/imports/import-job';
import { ImportJobStatus } from '@domain/imports/import-job-status';
import type { IImportJobRepository } from '@domain/imports/i-import-job-repository';
import { GetImportJobUseCase } from '@application/imports/use-cases/get-import-job-use-case';

const OWNER = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';

const makeJob = (status: ImportJobStatus): ImportJob =>
  ImportJob.restore({
    id: JOB_ID,
    ownerId: OWNER,
    url: 'https://www.instagram.com/reel/abc123/',
    locale: 'en',
    status,
    claimedBy: status === ImportJobStatus.Queued ? null : 'worker-1',
    claimedAt: status === ImportJobStatus.Queued ? null : new Date('2026-08-08T10:00:05Z'),
    attempts: status === ImportJobStatus.Queued ? 0 : 1,
    draftId: null,
    errorKey: null,
    createdAt: new Date('2026-08-08T10:00:00Z'),
    updatedAt: new Date('2026-08-08T10:00:05Z'),
  });

const makeRepo = (overrides: Partial<IImportJobRepository> = {}): IImportJobRepository =>
  ({
    getById: jest.fn(async () => ok(makeJob(ImportJobStatus.Queued))),
    countQueuedAhead: jest.fn(async () => ok(0)),
    ...overrides,
  }) as unknown as IImportJobRepository;

describe('GetImportJobUseCase — queue position', () => {
  it('is 1 for the job at the front, not 0', () => {
    // A user reads "1st in the queue". Zero-based would print "0th", and a
    // badge showing 0 reads as "nothing is happening".
    const repo = makeRepo({ countQueuedAhead: jest.fn(async () => ok(0)) });

    return new GetImportJobUseCase(repo)
      .execute({ jobId: JOB_ID, requesterId: OWNER })
      .then((result) => {
        expect(result.ok && result.value.queuePosition).toBe(1);
      });
  });

  it('counts the jobs ahead and adds this one', async () => {
    const repo = makeRepo({ countQueuedAhead: jest.fn(async () => ok(3)) });

    const result = await new GetImportJobUseCase(repo).execute({
      jobId: JOB_ID,
      requesterId: OWNER,
    });

    expect(result.ok && result.value.queuePosition).toBe(4);
  });

  it.each([ImportJobStatus.Running, ImportJobStatus.Done, ImportJobStatus.Failed])(
    'reports no position for a %s job, which is not waiting for a turn',
    async (status) => {
      const countQueuedAhead = jest.fn(async () => ok(5));
      const repo = makeRepo({
        getById: jest.fn(async () => ok(makeJob(status))),
        countQueuedAhead,
      });

      const result = await new GetImportJobUseCase(repo).execute({
        jobId: JOB_ID,
        requesterId: OWNER,
      });

      expect(result.ok && result.value.queuePosition).toBeNull();
      // And it does not ask: a running job has no place in the line, so the
      // COUNT would be a query whose answer is meaningless.
      expect(countQueuedAhead).not.toHaveBeenCalled();
    },
  );

  it('still returns the job when the count itself fails', async () => {
    // The position is the nicety; the job's state is the answer. Losing the
    // whole response to a failed COUNT would trade the one for the other.
    const repo = makeRepo({
      countQueuedAhead: jest.fn(async () => fail(new UnknownFailure('db down'))),
    });

    const result = await new GetImportJobUseCase(repo).execute({
      jobId: JOB_ID,
      requesterId: OWNER,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe(ImportJobStatus.Queued);
    expect(result.ok && result.value.queuePosition).toBeNull();
  });
});

describe('GetImportJobUseCase — ownership', () => {
  it("answers not_found for someone else's job, and never leaks its position", async () => {
    const repo = makeRepo();

    const result = await new GetImportJobUseCase(repo).execute({
      jobId: JOB_ID,
      requesterId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toBeInstanceOf(NotFoundFailure);
  });
});
