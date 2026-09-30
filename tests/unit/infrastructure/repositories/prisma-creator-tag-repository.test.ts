import { Prisma, type PrismaClient } from '@prisma/client';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import { CreatorHandle } from '@domain/users/creator-handle';
import { PrismaCreatorTagRepository } from '@infrastructure/repositories/users/prisma-creator-tag-repository';
import { approvedTag } from '../../fixtures/creator-tags';

function makePrisma(user: { findFirst?: jest.Mock; updateMany?: jest.Mock }): PrismaClient {
  return { user: { findFirst: jest.fn(), updateMany: jest.fn(), ...user } } as unknown as PrismaClient;
}

describe('PrismaCreatorTagRepository.findByUserId', () => {
  it('scopes the read to a live account and reports none as NotFound', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const result = await new PrismaCreatorTagRepository(makePrisma({ findFirst })).findByUserId('u1');
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 'u1', deletedAt: null });
    expect(!result.ok && result.failure.code).toBe('not_found');
  });

  it('reads status none as no claim', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      creatorStatus: CreatorStatus.None,
      creatorPlatform: null,
      creatorHandle: null,
      creatorRequestedAt: null,
      creatorReviewedAt: null,
    });
    const result = await new PrismaCreatorTagRepository(makePrisma({ findFirst })).findByUserId('u1');
    expect(result).toEqual({ ok: true, value: null });
  });
});

describe('PrismaCreatorTagRepository.save', () => {
  it('writes every claim column', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tag = approvedTag('ada');

    const result = await new PrismaCreatorTagRepository(makePrisma({ updateMany })).save('u1', tag);

    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', deletedAt: null },
      data: {
        creatorStatus: CreatorStatus.Approved,
        creatorPlatform: CreatorPlatform.Instagram,
        creatorHandle: 'ada',
        creatorRequestedAt: tag.requestedAt,
        creatorReviewedAt: tag.reviewedAt,
      },
    });
  });

  it('clears every column for null', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    await new PrismaCreatorTagRepository(makePrisma({ updateMany })).save('u1', null);
    expect(updateMany.mock.calls[0][0].data).toEqual({
      creatorStatus: CreatorStatus.None,
      creatorPlatform: null,
      creatorHandle: null,
      creatorRequestedAt: null,
      creatorReviewedAt: null,
    });
  });

  it('is NotFound when no live account matched', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const result = await new PrismaCreatorTagRepository(makePrisma({ updateMany })).save('u1', null);
    expect(!result.ok && result.failure.code).toBe('not_found');
  });

  it('maps the partial unique index refusing a second approved holder to creator_handle_taken', async () => {
    const violation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const updateMany = jest.fn().mockRejectedValue(violation);

    const result = await new PrismaCreatorTagRepository(makePrisma({ updateMany })).save('u1', approvedTag());

    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_handle_taken');
  });
});

describe('PrismaCreatorTagRepository.saveReview', () => {
  it('writes only over the pending claim on the same platform + handle, requested at the same time', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const reviewed = approvedTag('ada');

    const result = await new PrismaCreatorTagRepository(makePrisma({ updateMany })).saveReview('u1', reviewed);

    expect(result.ok).toBe(true);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 'u1',
      deletedAt: null,
      creatorStatus: CreatorStatus.Pending,
      creatorPlatform: CreatorPlatform.Instagram,
      creatorHandle: 'ada',
      // Withdraw + re-request of the same handle is a new claim: the old
      // decision must not land on it.
      creatorRequestedAt: reviewed.requestedAt,
    });
    expect(updateMany.mock.calls[0][0].data.creatorStatus).toBe(CreatorStatus.Approved);
  });

  it('answers creator_not_pending when the claim changed since it was read', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const result = await new PrismaCreatorTagRepository(makePrisma({ updateMany })).saveReview('u1', approvedTag());
    expect(!result.ok && result.failure.messageKey).toBe('errors.conflict.creator_not_pending');
  });
});

describe('PrismaCreatorTagRepository.findByUserId — unreadable claim', () => {
  it('reads a stored claim that no longer passes the handle rules as no claim', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'u1',
      creatorStatus: CreatorStatus.Approved,
      creatorPlatform: CreatorPlatform.TikTok,
      creatorHandle: 'a',
      creatorRequestedAt: new Date(),
      creatorReviewedAt: new Date(),
    });
    const result = await new PrismaCreatorTagRepository(makePrisma({ findFirst })).findByUserId('u1');
    expect(result).toEqual({ ok: true, value: null });
  });
});

describe('PrismaCreatorTagRepository.isHandleApprovedForAnotherUser', () => {
  it('looks for another user holding the same platform + handle, approved', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'u2' });
    const handle = CreatorHandle.create(CreatorPlatform.TikTok, '@Ada');
    if (!handle.ok) throw new Error('unreachable');

    const result = await new PrismaCreatorTagRepository(makePrisma({ findFirst })).isHandleApprovedForAnotherUser(handle.value, 'u1');

    expect(result).toEqual({ ok: true, value: true });
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: { not: 'u1' },
      creatorStatus: CreatorStatus.Approved,
      creatorPlatform: CreatorPlatform.TikTok,
      creatorHandle: 'ada',
    });
  });
});
