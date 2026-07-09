import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { NotFoundFailure, UnknownFailure } from '@core/failure';

// deleteAccount is a permanently destructive path: a single `user.delete`
// relies on the schema's `onDelete: Cascade` FKs to remove all owned rows.
// These tests lock down the error mapping at the infrastructure boundary:
// success → ok(undefined), Prisma P2025 (no matching row) → NotFoundFailure,
// anything else → UnknownFailure.

const USER_ID = 'user-1';

function makePrisma(deleteMock: jest.Mock): PrismaClient {
  return { user: { delete: deleteMock } } as unknown as PrismaClient;
}

function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', {
    code: 'P2025',
    clientVersion: '0.0.0-test',
  });
}

describe('PrismaAuthRepository.deleteAccount', () => {
  it('deletes the user row by id and resolves ok', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ id: USER_ID });
    const repo = new PrismaAuthRepository(makePrisma(deleteMock));

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: USER_ID } });
  });

  it('maps Prisma P2025 (user not found) to NotFoundFailure', async () => {
    const deleteMock = jest.fn().mockRejectedValue(p2025());
    const repo = new PrismaAuthRepository(makePrisma(deleteMock));

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(NotFoundFailure);
    }
  });

  it('maps unexpected errors to UnknownFailure without throwing', async () => {
    const deleteMock = jest.fn().mockRejectedValue(new Error('connection reset'));
    const repo = new PrismaAuthRepository(makePrisma(deleteMock));

    const result = await repo.deleteAccount(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});
