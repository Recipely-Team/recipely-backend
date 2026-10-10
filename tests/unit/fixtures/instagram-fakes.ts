import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import { DmRule } from '@domain/instagram/dm-rule';
import type { DmRuleProps } from '@domain/instagram/dm-rule-props';
import { DmSendStatus } from '@domain/instagram/dm-send-status';
import { InstagramConnection, type InstagramConnectionProps } from '@domain/instagram/instagram-connection';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { DmRuleListData, DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type {
  DmFunnelDay,
  DmFunnelRule,
  DmSendClaim,
  DmSendOutcome,
  DmSendRecord,
  DmSendRepositoryInterface,
} from '@domain/instagram/dm-send-repository-interface';
import type { InstagramGraphInterface, InstagramMediaData } from '@application/instagram/ports/instagram-graph-interface';
import type { OneTimeCodeInterface } from '@application/instagram/ports/one-time-code-interface';
import type { InstagramPendingLinkRepositoryInterface, PendingInstagramLink } from '@domain/instagram/instagram-pending-link-repository-interface';
import type {
  InstagramEventInput,
  InstagramEventQueueInterface,
  QueuedInstagramEvent,
} from '@application/instagram/ports/instagram-event-queue-interface';

export const NOW = new Date('2026-10-02T12:00:00Z');
export const USER = '00000000-0000-4000-8000-000000000001';
export const OTHER_USER = '00000000-0000-4000-8000-000000000002';
export const IG_USER = '17841400000000001';
export const APP_SCOPED_ID = '26000000000000001';
export const RECIPE = '00000000-0000-4000-8000-0000000000aa';
export const MEDIA = '18000000000000001';
const DAY_MS = 24 * 60 * 60 * 1000;

export function connection(overrides: Partial<InstagramConnectionProps> = {}): InstagramConnection {
  return InstagramConnection.restore({
    id: 'conn-1',
    userId: USER,
    igUserId: IG_USER,
    appScopedId: APP_SCOPED_ID,
    username: 'ada.cooks',
    accessToken: 'token-1',
    tokenExpiresAt: new Date(NOW.getTime() + 50 * DAY_MS),
    status: InstagramConnectionStatus.Active,
    connectedAt: new Date(NOW.getTime() - 10 * DAY_MS),
    refreshedAt: new Date(NOW.getTime() - 10 * DAY_MS),
    ...overrides,
  });
}

export function rule(overrides: Partial<DmRuleProps> = {}): DmRule {
  const created = DmRule.create({
    id: 'rule-1',
    userId: USER,
    mediaId: MEDIA,
    media: { permalink: 'https://instagram.com/p/x', thumbnailUrl: 'https://cdn/x.jpg', caption: 'Menemen' },
    keywords: ['tarif'],
    recipeId: RECIPE,
    dmText: 'Selam {name}! Tarif burada: {link}',
    publicReplyText: null,
    enabled: true,
    enabledAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
  if (!created.ok) throw new Error(created.failure.messageKey);
  return created.value;
}

export const media = (overrides: Partial<InstagramMediaData> = {}): InstagramMediaData => ({
  id: MEDIA,
  mediaType: 'VIDEO',
  thumbnailUrl: 'https://cdn/x.jpg',
  caption: 'Menemen',
  permalink: 'https://instagram.com/p/x',
  timestamp: NOW,
  ...overrides,
});

type Mocked<T> = { [K in keyof T]: T[K] & jest.Mock };

/** A graph whose every call succeeds unless a test says otherwise. */
export function fakeGraph(): Mocked<InstagramGraphInterface> {
  return {
    authorizeUrl: jest.fn((state: string) => `https://www.instagram.com/oauth/authorize?state=${state}`),
    exchangeCode: jest.fn().mockResolvedValue(ok({ accessToken: 'short' })),
    longLived: jest.fn().mockResolvedValue(ok({ accessToken: 'long', expiresInSeconds: 60 * 24 * 3600 })),
    refresh: jest.fn().mockResolvedValue(ok({ accessToken: 'refreshed', expiresInSeconds: 60 * 24 * 3600 })),
    profile: jest.fn().mockResolvedValue(ok({ igUserId: IG_USER, appScopedId: APP_SCOPED_ID, username: 'ada.cooks', mediaCount: 3, followersCount: 1200 })),
    subscribeWebhooks: jest.fn().mockResolvedValue(ok(undefined)),
    listMedia: jest.fn().mockResolvedValue(ok({ items: [media()], after: null })),
    listComments: jest.fn().mockResolvedValue(ok({ items: [], after: null })),
    findMedia: jest.fn().mockResolvedValue(ok(media())),
    sendPrivateReply: jest.fn().mockResolvedValue(ok(undefined)),
    replyToComment: jest.fn().mockResolvedValue(ok(undefined)),
  } as unknown as Mocked<InstagramGraphInterface>;
}

export class InMemoryInstagramConnections implements InstagramConnectionRepositoryInterface {
  readonly rows = new Map<string, InstagramConnection>();
  purged: string[] = [];

  seed(...connections: InstagramConnection[]): this {
    for (const c of connections) this.rows.set(c.userId, c);
    return this;
  }

  async findByUserId(userId: string): Promise<Result<InstagramConnection | null, Failure>> {
    return ok(this.rows.get(userId) ?? null);
  }

  async findByIgUserId(igUserId: string): Promise<Result<InstagramConnection | null, Failure>> {
    return ok([...this.rows.values()].find((c) => c.igUserId === igUserId || c.appScopedId === igUserId) ?? null);
  }

  async save(c: InstagramConnection): Promise<Result<void, Failure>> {
    const other = [...this.rows.values()].find((x) => x.igUserId === c.igUserId && x.userId !== c.userId);
    if (other !== undefined) return fail(new ConflictFailure('errors.conflict.instagram_account_linked'));
    this.rows.set(c.userId, c);
    return ok(undefined);
  }

  async delete(userId: string): Promise<Result<void, Failure>> {
    this.rows.delete(userId);
    return ok(undefined);
  }

  async listExpiringBefore(before: Date): Promise<Result<InstagramConnection[], Failure>> {
    return ok([...this.rows.values()].filter((c) => c.status === InstagramConnectionStatus.Active && c.tokenExpiresAt < before));
  }

  async expireLapsed(now: Date): Promise<Result<number, Failure>> {
    let n = 0;
    for (const c of this.rows.values()) {
      if (c.status === InstagramConnectionStatus.Active && c.tokenExpiresAt <= now) {
        this.rows.set(c.userId, c.expired());
        n += 1;
      }
    }
    return ok(n);
  }

  async purgeUser(userId: string): Promise<Result<void, Failure>> {
    this.purged.push(userId);
    this.rows.delete(userId);
    return ok(undefined);
  }
}

export class InMemoryPendingLinks implements InstagramPendingLinkRepositoryInterface {
  readonly rows = new Map<string, PendingInstagramLink>();

  async create(codeHash: string, link: PendingInstagramLink): Promise<Result<void, Failure>> {
    this.rows.set(codeHash, link);
    return ok(undefined);
  }

  async take(codeHash: string): Promise<Result<PendingInstagramLink | null, Failure>> {
    const link = this.rows.get(codeHash) ?? null;
    this.rows.delete(codeHash);
    return ok(link);
  }
}

/** Codes `code-1`, `code-2`…, hashed by prefixing `h:`. */
export function fakeCodes(): OneTimeCodeInterface & { mint: jest.Mock } {
  let n = 0;
  return { mint: jest.fn(() => `code-${(n += 1)}`), hash: (code: string) => `h:${code}` };
}

export class InMemoryDmRules implements DmRuleRepositoryInterface {
  readonly rows = new Map<string, DmRule>();
  sentCounts = new Map<string, number>();

  seed(...rules: DmRule[]): this {
    for (const r of rules) this.rows.set(r.id, r);
    return this;
  }

  async insert(r: DmRule): Promise<Result<void, Failure>> {
    this.rows.set(r.id, r);
    return ok(undefined);
  }

  async update(r: DmRule): Promise<Result<void, Failure>> {
    this.rows.set(r.id, r);
    return ok(undefined);
  }

  async delete(id: string, userId: string): Promise<Result<void, Failure>> {
    const r = this.rows.get(id);
    if (r === undefined || r.userId !== userId) return fail(new NotFoundFailure('errors.not_found.dm_rule'));
    this.rows.delete(id);
    return ok(undefined);
  }

  async findById(id: string, userId: string): Promise<Result<DmRule, Failure>> {
    const r = this.rows.get(id);
    return r === undefined || r.userId !== userId ? fail(new NotFoundFailure('errors.not_found.dm_rule')) : ok(r);
  }

  async findListData(id: string, userId: string): Promise<Result<DmRuleListData, Failure>> {
    const r = await this.findById(id, userId);
    return r.ok ? ok(this.data(r.value)) : r;
  }

  async listByUser(userId: string, page: number, pageSize: number): Promise<Result<PageResult<DmRuleListData>, Failure>> {
    const mine = [...this.rows.values()].filter((r) => r.userId === userId).reverse();
    return ok({ items: mine.slice((page - 1) * pageSize, page * pageSize).map((r) => this.data(r)), total: mine.length, page, pageSize });
  }

  async findEnabledForMedia(userId: string, mediaId: string): Promise<Result<DmRule[], Failure>> {
    return ok([...this.rows.values()].filter((r) => r.userId === userId && r.mediaId === mediaId && r.enabled));
  }

  private data(r: DmRule): DmRuleListData {
    return { rule: r, sentCount: this.sentCounts.get(r.id) ?? 0, recipe: { id: r.recipeId, names: { en: 'Menemen', tr: 'Menemen' }, image: 'https://x/m.jpg' } };
  }
}

export class InMemoryDmSends implements DmSendRepositoryInterface {
  readonly rows = new Map<string, DmSendRecord & { ruleUser: string }>();

  async claim(c: DmSendClaim): Promise<Result<DmSendRecord, Failure>> {
    const existing = [...this.rows.values()].find((r) => r.commentId === c.commentId);
    if (existing !== undefined) return ok(existing);
    const record = {
      id: `send-${this.rows.size + 1}`,
      ruleId: c.ruleId,
      commentId: c.commentId,
      commenterUsername: c.commenterUsername,
      commentText: c.commentText,
      status: DmSendStatus.Pending,
      reason: null,
      publicReplied: false,
      createdAt: NOW,
      sentAt: null,
      ruleUser: c.userId,
    } as DmSendRecord & { ruleUser: string };
    this.rows.set(record.id, record);
    return ok(record);
  }

  scrubbedBefore: Date[] = [];

  async scrubCommenterDetailsBefore(cutoff: Date): Promise<Result<void, Failure>> {
    this.scrubbedBefore.push(cutoff);
    return ok(undefined);
  }

  async complete(id: string, o: DmSendOutcome): Promise<Result<void, Failure>> {
    const r = this.rows.get(id);
    if (r === undefined) return fail(new NotFoundFailure('errors.not_found.dm_send'));
    this.rows.set(id, { ...r, status: o.status, reason: o.reason, publicReplied: o.publicReplied, sentAt: o.status === DmSendStatus.Sent ? o.at : null });
    return ok(undefined);
  }

  async listByRule(ruleId: string, userId: string, page: number, pageSize: number): Promise<Result<PageResult<DmSendRecord>, Failure>> {
    const all = [...this.rows.values()].filter((r) => r.ruleId === ruleId && r.ruleUser === userId);
    return ok({ items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  }

  readonly opened = new Map<string, Date>();
  readonly saved = new Map<string, Date>();
  /** The recipe each rule sends, for `markSaved`; unlisted rules send RECIPE. */
  readonly recipeOfRule = new Map<string, string>();
  dayFunnel: DmFunnelDay[] = [];
  ruleFunnel: DmFunnelRule[] = [];
  readonly funnelCalls: { from: Date; to: Date }[] = [];

  async markOpened(id: string, at: Date): Promise<Result<boolean, Failure>> {
    const r = this.rows.get(id);
    if (r === undefined || r.status !== DmSendStatus.Sent || this.opened.has(id)) return ok(false);
    this.opened.set(id, at);
    return ok(true);
  }

  async markSaved(id: string, recipeId: string, at: Date): Promise<Result<boolean, Failure>> {
    const r = this.rows.get(id);
    if (r === undefined || r.status !== DmSendStatus.Sent || (this.recipeOfRule.get(r.ruleId) ?? RECIPE) !== recipeId || this.saved.has(id)) return ok(false);
    this.saved.set(id, at);
    if (!this.opened.has(id)) this.opened.set(id, at);
    return ok(true);
  }

  async funnelByDay(_userId: string, from: Date, to: Date): Promise<Result<DmFunnelDay[], Failure>> {
    this.funnelCalls.push({ from, to });
    return ok(this.dayFunnel.filter((d) => d.day >= from.toISOString().slice(0, 10) && d.day < to.toISOString().slice(0, 10)));
  }

  async funnelByRule(): Promise<Result<DmFunnelRule[], Failure>> {
    return ok(this.ruleFunnel);
  }

  only(): DmSendRecord {
    const [first] = [...this.rows.values()];
    if (first === undefined) throw new Error('no send recorded');
    return first;
  }
}

export class InMemoryEventQueue implements InstagramEventQueueInterface {
  readonly events: Array<Omit<QueuedInstagramEvent, 'attempts'> & { attempts: number; status: string; availableAt: Date; lastError: string | null }> = [];
  pruned: Date[] = [];

  async enqueue(events: readonly InstagramEventInput[], _now: Date): Promise<Result<number, Failure>> {
    let added = 0;
    for (const e of events) {
      if (e.dedupeKey !== undefined && this.events.some((x) => x.dedupeKey === e.dedupeKey)) continue;
      this.events.push({ ...e, id: `ev-${this.events.length + 1}`, attempts: 0, status: 'queued', availableAt: new Date(0), lastError: null });
      added += 1;
    }
    return ok(added);
  }

  async claim(now: Date, limit: number): Promise<Result<QueuedInstagramEvent[], Failure>> {
    const due = this.events.filter((e) => e.status === 'queued' && e.availableAt <= now).slice(0, limit);
    for (const e of due) e.attempts += 1;
    return ok(due.map((e) => ({ ...e })));
  }

  async done(id: string): Promise<Result<void, Failure>> {
    this.find(id).status = 'done';
    return ok(undefined);
  }

  async retryAt(id: string, at: Date, error: string): Promise<Result<void, Failure>> {
    const e = this.find(id);
    e.availableAt = at;
    e.lastError = error;
    return ok(undefined);
  }

  async failed(id: string, error: string): Promise<Result<void, Failure>> {
    const e = this.find(id);
    e.status = 'failed';
    e.lastError = error;
    return ok(undefined);
  }

  async prune(before: Date): Promise<Result<number, Failure>> {
    this.pruned.push(before);
    return ok(0);
  }

  private find(id: string) {
    const e = this.events.find((x) => x.id === id);
    if (e === undefined) throw new Error(`no event ${id}`);
    return e;
  }
}

/** A `comments` webhook body for one comment. */
export function commentWebhook(overrides: { text?: string; fromId?: string; fromUsername?: string; commentId?: string; mediaId?: string; time?: number; igUserId?: string } = {}) {
  return {
    object: 'instagram',
    entry: [
      {
        id: overrides.igUserId ?? IG_USER,
        time: overrides.time ?? Math.floor(NOW.getTime() / 1000),
        changes: [
          {
            field: 'comments',
            value: {
              id: overrides.commentId ?? 'comment-1',
              text: overrides.text ?? 'Tarif lütfen!',
              from: { id: overrides.fromId ?? '9001', username: overrides.fromUsername ?? 'meraklı_aşçı' },
              media: { id: overrides.mediaId ?? MEDIA, media_product_type: 'REELS' },
            },
          },
        ],
      },
    ],
  };
}
