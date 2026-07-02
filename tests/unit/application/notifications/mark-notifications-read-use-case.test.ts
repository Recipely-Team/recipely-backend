import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { INotificationRepository } from '@application/notifications/ports/i-notification-repository';
import { MarkNotificationsReadUseCase } from '@application/notifications/use-cases/mark-notifications-read-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const NOTIFICATION_ID = 'notification-uuid';

interface RepoOptions {
  markReadResult?: Result<void, Failure>;
  markAllReadResult?: Result<void, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: INotificationRepository;
  markReadCalls: () => Array<{ id: string; recipientId: string }>;
  markAllReadCalls: () => string[];
} {
  const markReadCalls: Array<{ id: string; recipientId: string }> = [];
  const markAllReadCalls: string[] = [];

  const repo: INotificationRepository = {
    create: jest.fn(),
    exists: jest.fn(),
    listForUser: jest.fn(),
    countUnread: jest.fn(),

    async markRead(id, recipientId): Promise<Result<void, Failure>> {
      markReadCalls.push({ id, recipientId });
      return options.markReadResult ?? ok(undefined);
    },

    async markAllRead(recipientId): Promise<Result<void, Failure>> {
      markAllReadCalls.push(recipientId);
      return options.markAllReadResult ?? ok(undefined);
    },
  };

  return { repo, markReadCalls: () => markReadCalls, markAllReadCalls: () => markAllReadCalls };
}

// ---- tests ------------------------------------------------------------------

describe('MarkNotificationsReadUseCase — single notification', () => {
  it('marks the given notification read, scoped to the requesting user', async () => {
    const { repo, markReadCalls, markAllReadCalls } = makeRepo();
    const useCase = new MarkNotificationsReadUseCase(repo);

    const result = await useCase.execute({ userId: USER_ID, notificationId: NOTIFICATION_ID });

    expect(result.ok).toBe(true);
    expect(markReadCalls()).toEqual([{ id: NOTIFICATION_ID, recipientId: USER_ID }]);
    expect(markAllReadCalls()).toHaveLength(0);
  });

  it('propagates NotFoundFailure when the notification does not belong to the user', async () => {
    const notFound = new NotFoundFailure('errors.not_found.notification');
    const { repo } = makeRepo({ markReadResult: fail(notFound) });
    const useCase = new MarkNotificationsReadUseCase(repo);

    const result = await useCase.execute({ userId: USER_ID, notificationId: NOTIFICATION_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('MarkNotificationsReadUseCase — all notifications', () => {
  it('marks all notifications read when no notificationId is given', async () => {
    const { repo, markReadCalls, markAllReadCalls } = makeRepo();
    const useCase = new MarkNotificationsReadUseCase(repo);

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(true);
    expect(markAllReadCalls()).toEqual([USER_ID]);
    expect(markReadCalls()).toHaveLength(0);
  });

  it('is ok even when there is nothing unread (idempotent)', async () => {
    const { repo } = makeRepo({ markAllReadResult: ok(undefined) });
    const useCase = new MarkNotificationsReadUseCase(repo);

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(true);
  });

  it('propagates the failure when markAllRead fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ markAllReadResult: fail(repoFailure) });
    const useCase = new MarkNotificationsReadUseCase(repo);

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
