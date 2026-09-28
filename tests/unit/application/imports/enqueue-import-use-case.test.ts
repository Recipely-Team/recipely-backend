import { EnqueueImportUseCase } from '@application/imports/use-cases/enqueue-import-use-case';
import { ImportJobStatus } from '@domain/imports/import-job-status';
import { ok } from '@core/result/result';
import type { ImportJob } from '@domain/imports/import-job';

const MAX_IN_FLIGHT = 3;

function build(inFlight = 0) {
  const created: ImportJob[] = [];
  const repo = {
    create: jest.fn(async (j: ImportJob) => {
      created.push(j);
      return ok(j);
    }),
    countInFlightByOwner: jest.fn().mockResolvedValue(ok(inFlight)),
    getById: jest.fn(),
    claimNext: jest.fn(),
    save: jest.fn(),
    failExhausted: jest.fn(),
  };

  return { useCase: new EnqueueImportUseCase(repo as never, MAX_IN_FLIGHT), repo, created };
}

describe('enqueueing an import', () => {
  it('returns a receipt immediately rather than a recipe', async () => {
    const h = build();

    const result = await h.useCase.execute({
      ownerId: 'user-1',
      url: 'https://www.instagram.com/reel/abc/',
      locale: 'tr',
    });
    if (!result.ok) throw new Error('enqueue rejected a valid url');

    expect(result.value.status).toBe(ImportJobStatus.Queued);
    expect(result.value.draftId).toBeNull();
    expect(result.value.id).toHaveLength(36);
  });

  // The symptom this prevents: the worker extracts an English recipe for a
  // Turkish user, and the completion push arrives in English too — because by
  // the time the job runs, the request that knew the language is long gone.
  it('captures the requester language on the job', async () => {
    const h = build();

    await h.useCase.execute({ ownerId: 'user-1', url: 'https://instagram.com/p/x/', locale: 'tr' });

    expect(h.created[0]?.locale).toBe('tr');
  });

  it('queues a recipe web page, which the worker reads from its markup', async () => {
    const h = build();

    const result = await h.useCase.execute({
      ownerId: 'user-1',
      url: 'https://www.nefisyemektarifleri.com/menemen-tarifi/',
      locale: 'tr',
    });

    expect(result.ok).toBe(true);
    expect(h.created[0]?.url).toBe('https://www.nefisyemektarifleri.com/menemen-tarifi/');
    // Recorded beside the job, so the claim keeps it from a worker that
    // cannot read a page safely.
    expect(h.repo.create).toHaveBeenCalledWith(expect.anything(), 'WEB');
  });

  it('rejects an address on the box network before any row is written', async () => {
    const h = build();

    const result = await h.useCase.execute({
      ownerId: 'user-1',
      url: 'http://169.254.169.254/latest/meta-data/',
      locale: 'en',
    });

    expect(result.ok).toBe(false);
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  // The queue is FIFO, so one user queueing without bound works through
  // everyone else's place in line.
  it('refuses once the caller is at the in-flight cap', async () => {
    const h = build(MAX_IN_FLIGHT);

    const result = await h.useCase.execute({
      ownerId: 'user-1',
      url: 'https://instagram.com/p/x/',
      locale: 'en',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('too_many_requests');
    expect(h.repo.create).not.toHaveBeenCalled();
  });

  it('allows the request that lands exactly under the cap', async () => {
    const h = build(MAX_IN_FLIGHT - 1);

    const result = await h.useCase.execute({
      ownerId: 'user-1',
      url: 'https://instagram.com/p/x/',
      locale: 'en',
    });

    expect(result.ok).toBe(true);
  });
});
