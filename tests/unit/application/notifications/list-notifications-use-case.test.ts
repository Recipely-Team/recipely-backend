import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  INotificationRepository,
  NotificationItem,
} from '@application/notifications/ports/i-notification-repository';
import {
  ListNotificationsUseCase,
  type ListNotificationsInput,
} from '@application/notifications/use-cases/list-notifications-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';

function makeItem(id: string, overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    type: 'recipe_liked',
    senderId: 'sender-1',
    senderDisplayName: 'Ada Lovelace',
    senderPhotoUrl: null,
    recipeId: 'recipe-1',
    recipeTitle: 'Carbonara',
    message: null,
    read: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---- mocks ------------------------------------------------------------------

interface RepoOptions {
  listResult?: Result<{ items: NotificationItem[]; total: number }, Failure>;
  countUnreadResult?: Result<number, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: INotificationRepository;
  listCalls: () => Array<{ recipientId: string; limit: number; offset: number }>;
  countUnreadCalls: () => string[];
} {
  const listCalls: Array<{ recipientId: string; limit: number; offset: number }> = [];
  const countUnreadCalls: string[] = [];

  const repo: INotificationRepository = {
    create: jest.fn(),
    exists: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),

    async listForUser(recipientId, limit, offset): Promise<Result<{ items: NotificationItem[]; total: number }, Failure>> {
      listCalls.push({ recipientId, limit, offset });
      return options.listResult ?? ok({ items: [makeItem('n1')], total: 1 });
    },

    async countUnread(recipientId): Promise<Result<number, Failure>> {
      countUnreadCalls.push(recipientId);
      return options.countUnreadResult ?? ok(1);
    },
  };

  return { repo, listCalls: () => listCalls, countUnreadCalls: () => countUnreadCalls };
}

function makeInput(overrides: Partial<ListNotificationsInput> = {}): ListNotificationsInput {
  return { userId: USER_ID, ...overrides };
}

// ---- tests ------------------------------------------------------------------

describe('ListNotificationsUseCase — happy path', () => {
  it('returns items, total, and unread count', async () => {
    const items = [makeItem('n1'), makeItem('n2', { read: true })];
    const { repo } = makeRepo({
      listResult: ok({ items, total: 12 }),
      countUnreadResult: ok(5),
    });
    const useCase = new ListNotificationsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual(items);
    expect(result.value.total).toBe(12);
    expect(result.value.unreadCount).toBe(5);
  });

  it('returns an empty list with zero counts when the user has no notifications', async () => {
    const { repo } = makeRepo({
      listResult: ok({ items: [], total: 0 }),
      countUnreadResult: ok(0),
    });
    const useCase = new ListNotificationsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ items: [], total: 0, unreadCount: 0 });
  });
});

describe('ListNotificationsUseCase — pagination defaults', () => {
  it('defaults to limit 20 and offset 0', async () => {
    const { repo, listCalls } = makeRepo();
    const useCase = new ListNotificationsUseCase(repo);

    await useCase.execute(makeInput());

    expect(listCalls()).toEqual([{ recipientId: USER_ID, limit: 20, offset: 0 }]);
  });

  it('forwards explicit limit and offset', async () => {
    const { repo, listCalls } = makeRepo();
    const useCase = new ListNotificationsUseCase(repo);

    await useCase.execute(makeInput({ limit: 5, offset: 10 }));

    expect(listCalls()).toEqual([{ recipientId: USER_ID, limit: 5, offset: 10 }]);
  });

  it('counts unread for the requesting user', async () => {
    const { repo, countUnreadCalls } = makeRepo();
    const useCase = new ListNotificationsUseCase(repo);

    await useCase.execute(makeInput());

    expect(countUnreadCalls()).toEqual([USER_ID]);
  });
});

describe('ListNotificationsUseCase — repository failures', () => {
  it('propagates the failure when listForUser fails and skips countUnread', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo, countUnreadCalls } = makeRepo({ listResult: fail(repoFailure) });
    const useCase = new ListNotificationsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
    expect(countUnreadCalls()).toHaveLength(0);
  });

  it('propagates the failure when countUnread fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { repo } = makeRepo({ countUnreadResult: fail(repoFailure) });
    const useCase = new ListNotificationsUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
