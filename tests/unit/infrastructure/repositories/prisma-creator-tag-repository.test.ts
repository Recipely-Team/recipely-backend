import { Prisma, type PrismaClient } from '@prisma/client';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorHandle } from '@domain/users/creator-handle';
import { PrismaCreatorTagRepository } from '@infrastructure/repositories/users/prisma-creator-tag-repository';
import { approvedTag, pendingTag } from '../../fixtures/creator-tags';

const IG = CreatorPlatform.Instagram;
const TT = CreatorPlatform.TikTok;

interface Mocks {
  userFindFirst: jest.Mock;
  userCount: jest.Mock;
  tagFindFirst: jest.Mock;
  tagUpsert: jest.Mock;
  tagDeleteMany: jest.Mock;
  tagUpdateMany: jest.Mock;
}

function setup(overrides: Partial<Mocks> = {}): { repo: PrismaCreatorTagRepository; mocks: Mocks } {
  const mocks: Mocks = {
    userFindFirst: jest.fn().mockResolvedValue(null),
    userCount: jest.fn().mockResolvedValue(1),
    tagFindFirst: jest.fn().mockResolvedValue(null),
    tagUpsert: jest.fn().mockResolvedValue({}),
    tagDeleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    tagUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  };
  const prisma = {
    user: { findFirst: mocks.userFindFirst, count: mocks.userCount },
    creatorTag: {
      findFirst: mocks.tagFindFirst,
      upsert: mocks.tagUpsert,
      deleteMany: mocks.tagDeleteMany,
      updateMany: mocks.tagUpdateMany,
    },
  } as unknown as PrismaClient;
  return { repo: new PrismaCreatorTagRepository(prisma), mocks };
}

function tagRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tag-1',
    userId: 'u1',
    platform: IG,
    handle: 'ada',
    status: CreatorStatus.Approved,
    requestedAt: new Date('2026-09-01T10:00:00Z'),
    reviewedAt: new Date('2026-09-02T10:00:00Z'),
    ...over,
  };
}

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

describe('PrismaCreatorTagRepository.findByUserId', () => {
  it('scopes the read to a live account and reports none as NotFound', async () => {
    const { repo, mocks } = setup();
    const result = await repo.findByUserId('u1');
    expect(mocks.userFindFirst.mock.calls[0][0].where).toEqual({ id: 'u1', deletedAt: null });
    expect(!result.ok && result.failure.code).toBe('not_found');
  });

  it('reads every platform\'s claim, ordered by platform', async () => {
    const { repo, mocks } = setup({
      userFindFirst: jest.fn().mockResolvedValue({
        id: 'u1',
        creatorTags: [tagRow(), tagRow({ id: 'tag-2', platform: TT, handle: 'ada_tt', status: CreatorStatus.Pending, reviewedAt: null })],
      }),
    });

    const result = await repo.findByUserId('u1');

    expect(mocks.userFindFirst.mock.calls[0][0].select.creatorTags).toEqual({ orderBy: { platform: 'asc' } });
    if (!result.ok) throw new Error('expected claims');
    expect(result.value.map((t) => [t.platform, t.handle, t.status])).toEqual([
      [IG, 'ada', CreatorStatus.Approved],
      [TT, 'ada_tt', CreatorStatus.Pending],
    ]);
  });

  it('is empty for a live user with no claims', async () => {
    const { repo } = setup({ userFindFirst: jest.fn().mockResolvedValue({ id: 'u1', creatorTags: [] }) });
    expect(await repo.findByUserId('u1')).toEqual({ ok: true, value: [] });
  });

  it('leaves out a stored claim that no longer passes the handle rules, keeping the other', async () => {
    const { repo } = setup({
      userFindFirst: jest.fn().mockResolvedValue({ id: 'u1', creatorTags: [tagRow(), tagRow({ platform: TT, handle: 'a' })] }),
    });
    const result = await repo.findByUserId('u1');
    expect(result.ok && result.value.map((t) => t.platform)).toEqual([IG]);
  });
});

describe('PrismaCreatorTagRepository.findById', () => {
  it('reads the tag only while its owner is live, and answers it with the owner id', async () => {
    const { repo, mocks } = setup({ tagFindFirst: jest.fn().mockResolvedValue(tagRow({ status: CreatorStatus.Pending, reviewedAt: null })) });

    const result = await repo.findById('tag-1');

    expect(mocks.tagFindFirst.mock.calls[0][0].where).toEqual({ id: 'tag-1', user: { deletedAt: null } });
    if (!result.ok || result.value === null) throw new Error('expected a tag');
    expect(result.value.userId).toBe('u1');
    expect(result.value.tag.isPending).toBe(true);
  });

  it('is null for an unknown id or a deleted owner', async () => {
    const { repo } = setup();
    expect(await repo.findById('nope')).toEqual({ ok: true, value: null });
  });
});

describe('PrismaCreatorTagRepository.save', () => {
  it('upserts that platform\'s row on the (user, platform) key', async () => {
    const { repo, mocks } = setup();
    const tag = pendingTag('ada_tt', TT);

    const result = await repo.save('u1', tag);

    expect(result.ok).toBe(true);
    const columns = { handle: 'ada_tt', status: CreatorStatus.Pending, requestedAt: tag.requestedAt, reviewedAt: null };
    expect(mocks.tagUpsert).toHaveBeenCalledWith({
      where: { userId_platform: { userId: 'u1', platform: TT } },
      create: { userId: 'u1', platform: TT, ...columns },
      update: columns,
    });
  });

  it('is NotFound, writing nothing, when no live account matched', async () => {
    const { repo, mocks } = setup({ userCount: jest.fn().mockResolvedValue(0) });
    const result = await repo.save('u1', pendingTag());
    expect(mocks.userCount).toHaveBeenCalledWith({ where: { id: 'u1', deletedAt: null } });
    expect(!result.ok && result.failure.code).toBe('not_found');
    expect(mocks.tagUpsert).not.toHaveBeenCalled();
  });

  it('maps the partial unique index refusing a second approved holder to creator_handle_taken', async () => {
    const { repo } = setup({ tagUpsert: jest.fn().mockRejectedValue(uniqueViolation()) });
    const result = await repo.save('u1', approvedTag());
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
  });
});

describe('PrismaCreatorTagRepository.remove', () => {
  it('deletes only that platform\'s row', async () => {
    const { repo, mocks } = setup();
    const result = await repo.remove('u1', TT);
    expect(result.ok).toBe(true);
    expect(mocks.tagDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', platform: TT } });
  });

  it('succeeds when there was nothing to delete', async () => {
    const { repo } = setup({ tagDeleteMany: jest.fn().mockResolvedValue({ count: 0 }) });
    expect((await repo.remove('u1', IG)).ok).toBe(true);
  });

  it('is NotFound for no live account', async () => {
    const { repo, mocks } = setup({ userCount: jest.fn().mockResolvedValue(0) });
    const result = await repo.remove('u1', IG);
    expect(!result.ok && result.failure.code).toBe('not_found');
    expect(mocks.tagDeleteMany).not.toHaveBeenCalled();
  });
});

describe('PrismaCreatorTagRepository.saveReview', () => {
  it('writes only over the pending claim on the same platform + handle, requested at the same time, of a live user', async () => {
    const { repo, mocks } = setup();
    const reviewed = approvedTag('ada');

    const result = await repo.saveReview('u1', reviewed);

    expect(result.ok).toBe(true);
    expect(mocks.tagUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        platform: IG,
        user: { deletedAt: null },
        status: CreatorStatus.Pending,
        handle: 'ada',
        // Withdraw + re-request of the same handle is a new claim: the old
        // decision must not land on it.
        requestedAt: reviewed.requestedAt,
      },
      data: { status: CreatorStatus.Approved, reviewedAt: reviewed.reviewedAt },
    });
  });

  it('answers creator_not_pending when the claim changed since it was read', async () => {
    const { repo } = setup({ tagUpdateMany: jest.fn().mockResolvedValue({ count: 0 }) });
    const result = await repo.saveReview('u1', approvedTag());
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
  });

  it('maps a racing second approval refused by the partial index to creator_handle_taken', async () => {
    const { repo } = setup({ tagUpdateMany: jest.fn().mockRejectedValue(uniqueViolation()) });
    const result = await repo.saveReview('u1', approvedTag());
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
  });
});

describe('PrismaCreatorTagRepository.isHandleApprovedForAnotherUser', () => {
  it('looks for another user holding the same platform + handle, approved', async () => {
    const { repo, mocks } = setup({ tagFindFirst: jest.fn().mockResolvedValue({ id: 'tag-9' }) });
    const handle = CreatorHandle.create(TT, '@Ada');
    if (!handle.ok) throw new Error('unreachable');

    const result = await repo.isHandleApprovedForAnotherUser(handle.value, 'u1');

    expect(result).toEqual({ ok: true, value: true });
    expect(mocks.tagFindFirst.mock.calls[0][0].where).toEqual({
      userId: { not: 'u1' },
      status: CreatorStatus.Approved,
      platform: TT,
      handle: 'ada',
    });
  });
});
