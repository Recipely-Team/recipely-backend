import { ok } from '@core/result/result';
import { ClaimImportJobUseCase } from '@application/imports/use-cases/claim-import-job-use-case';
import { claimAcceptsWeb } from '@presentation/validators/import-jobs.validators';

/**
 * The rollout hole this closes: a worker still on the previous image hands
 * every URL to yt-dlp, which fetches a web page's address without checking
 * where it resolves. Such a worker says nothing about capabilities, and must
 * therefore never be handed a web-page job.
 */
describe('which workers are handed web-page jobs', () => {
  it.each([
    ['a worker from before web imports, which sends no body', undefined],
    ['an empty body', {}],
    ['capabilities that do not include web', { capabilities: ['video'] }],
    ['a malformed body', { capabilities: 'web' }],
  ])('not %s', (_why, body) => {
    expect(claimAcceptsWeb(body)).toBe(false);
  });

  it('a worker that says it reads web pages', () => {
    expect(claimAcceptsWeb({ capabilities: ['web'] })).toBe(true);
  });

  it('passes the answer through to the claim itself', async () => {
    const claimNext = jest.fn().mockResolvedValue(ok(null));
    const useCase = new ClaimImportJobUseCase({ claimNext } as never, 60_000, 3);

    await useCase.execute({ workerId: 'w1', acceptsWeb: false });

    expect(claimNext).toHaveBeenCalledWith(expect.objectContaining({ workerId: 'w1', acceptsWeb: false }));
  });
});

