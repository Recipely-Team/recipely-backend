import type { PrismaClient } from '@prisma/client';
import { PrismaImportJobRepository } from '@infrastructure/repositories/imports/prisma-import-job-repository';
import { ImportJob } from '@domain/imports/import-job';

/**
 * The rollout hole this pins shut: a worker still on the image from before
 * web imports hands every URL to yt-dlp, which fetches a web page's address
 * without checking where it resolves. The claim must never give such a worker
 * a WEB job — and the only thing that stops it is one clause in raw SQL, which
 * no type checks. Delete the clause and these fail.
 */

const makePrisma = (queryRaw: jest.Mock, create: jest.Mock = jest.fn()): PrismaClient =>
  ({ $queryRaw: queryRaw, importJob: { create } }) as unknown as PrismaClient;

const claimSql = async (acceptsWeb: boolean): Promise<{ sql: string; values: unknown[] }> => {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const repo = new PrismaImportJobRepository(makePrisma(queryRaw));

  await repo.claimNext({ workerId: 'w1', leaseMs: 60_000, maxAttempts: 3, now: new Date(), acceptsWeb });

  const [strings, ...values] = queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];
  return { sql: strings.join('?'), values };
};

describe('claiming a job', () => {
  it('keeps WEB jobs behind the worker’s own capability', async () => {
    const { sql } = await claimSql(false);
    expect(sql).toMatch(/\(\s*\?::boolean OR source_platform IS DISTINCT FROM \?::"SourcePlatform"\s*\)/);
  });

  it('binds the capability the worker declared, and WEB as the platform it gates', async () => {
    const { values } = await claimSql(false);
    expect(values).toContain(false);
    expect(values).toContain('WEB');
  });
});

describe('queueing a job', () => {
  it('records what kind of link it is, which is what the claim filters on', async () => {
    const create = jest.fn().mockRejectedValue(new Error('stop after the write'));
    const repo = new PrismaImportJobRepository(makePrisma(jest.fn(), create));
    const job = ImportJob.queue({ id: '00000000-0000-4000-8000-000000000001', ownerId: 'u1', url: 'https://example.com/r', locale: 'tr', now: new Date() });
    if (!job.ok) throw new Error('fixture job did not build');

    await repo.create(job.value, 'WEB');

    expect(create.mock.calls[0][0].data.sourcePlatform).toBe('WEB');
  });
});
