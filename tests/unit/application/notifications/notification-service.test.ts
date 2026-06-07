import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { NotificationService } from '@application/notifications/notification-service';
import type { INotificationRepository, NotificationItem } from '@application/notifications/ports/i-notification-repository';
import type { IPushNotifier, PushPayload } from '@application/notifications/ports/i-push-notifier';

// ---- fixtures ----------------------------------------------------------------

const RECIPIENT = 'owner-uuid';
const SENDER = 'liker-uuid';
const RECIPE = 'recipe-uuid';

interface CreateCall {
  recipientId: string;
  type: string;
  senderId?: string;
  recipeId?: string;
}

function makeRepo(options: { existsResult?: Result<boolean, Failure> } = {}): {
  repo: INotificationRepository;
  createCalls: () => CreateCall[];
  existsCalls: () => CreateCall[];
} {
  const createCalls: CreateCall[] = [];
  const existsCalls: CreateCall[] = [];
  const existsResult = options.existsResult ?? ok(false);

  const repo: INotificationRepository = {
    async create(input): Promise<Result<void, Failure>> {
      createCalls.push(input);
      return ok(undefined);
    },
    async exists(input): Promise<Result<boolean, Failure>> {
      existsCalls.push(input);
      return existsResult;
    },
    listForUser: jest.fn<Promise<Result<{ items: NotificationItem[]; total: number }, Failure>>, [string, number, number]>(),
    countUnread: jest.fn<Promise<Result<number, Failure>>, [string]>(),
    markAllRead: jest.fn<Promise<Result<void, Failure>>, [string]>(),
    markRead: jest.fn<Promise<Result<void, Failure>>, [string, string]>(),
  };

  return { repo, createCalls: () => createCalls, existsCalls: () => existsCalls };
}

function makePushNotifier(): { push: IPushNotifier; sendCalls: () => string[] } {
  const sendCalls: string[] = [];
  const push: IPushNotifier = {
    async sendToUser(recipientId: string, _payload: PushPayload): Promise<Result<void, Failure>> {
      sendCalls.push(recipientId);
      return ok(undefined);
    },
  };
  return { push, sendCalls: () => sendCalls };
}

const likeInput = {
  recipientId: RECIPIENT,
  type: 'like' as const,
  senderId: SENDER,
  recipeId: RECIPE,
  title: 'New like',
  body: 'Someone liked your recipe.',
};

// ---- tests ------------------------------------------------------------------

describe('NotificationService — default (no dedupe)', () => {
  it('always creates a notification and sends a push', async () => {
    const { repo, createCalls } = makeRepo();
    const { push, sendCalls } = makePushNotifier();
    const service = new NotificationService(repo, push);

    await service.notify({ ...likeInput });

    expect(createCalls()).toHaveLength(1);
    expect(sendCalls()).toEqual([RECIPIENT]);
  });

  it('does not consult exists when dedupe is not set', async () => {
    const { repo, existsCalls } = makeRepo();
    const { push } = makePushNotifier();
    const service = new NotificationService(repo, push);

    await service.notify({ ...likeInput });

    expect(existsCalls()).toHaveLength(0);
  });
});

describe('NotificationService — dedupe', () => {
  it('skips create and push when an identical notification already exists', async () => {
    const { repo, createCalls } = makeRepo({ existsResult: ok(true) });
    const { push, sendCalls } = makePushNotifier();
    const service = new NotificationService(repo, push);

    await service.notify({ ...likeInput, dedupe: true });

    expect(createCalls()).toHaveLength(0);
    expect(sendCalls()).toHaveLength(0);
  });

  it('creates and pushes when no matching notification exists yet', async () => {
    const { repo, createCalls } = makeRepo({ existsResult: ok(false) });
    const { push, sendCalls } = makePushNotifier();
    const service = new NotificationService(repo, push);

    await service.notify({ ...likeInput, dedupe: true });

    expect(createCalls()).toHaveLength(1);
    expect(sendCalls()).toEqual([RECIPIENT]);
  });

  it('queries exists with the notification identity', async () => {
    const { repo, existsCalls } = makeRepo({ existsResult: ok(false) });
    const { push } = makePushNotifier();
    const service = new NotificationService(repo, push);

    await service.notify({ ...likeInput, dedupe: true });

    expect(existsCalls()[0]).toEqual({
      recipientId: RECIPIENT,
      type: 'like',
      senderId: SENDER,
      recipeId: RECIPE,
    });
  });

  it('falls back to creating when the exists check itself fails', async () => {
    const { repo, createCalls } = makeRepo({ existsResult: fail(new UnknownFailure('errors.db.read_failed')) });
    const { push, sendCalls } = makePushNotifier();
    const service = new NotificationService(repo, push);

    await service.notify({ ...likeInput, dedupe: true });

    // A failed dedup check must not silently drop a genuine notification.
    expect(createCalls()).toHaveLength(1);
    expect(sendCalls()).toEqual([RECIPIENT]);
  });
});
