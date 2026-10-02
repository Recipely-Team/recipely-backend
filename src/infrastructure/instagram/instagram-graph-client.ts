import { fail, ok, type Result } from '@core/result/result';
import {
  ForbiddenFailure,
  ServiceUnavailableFailure,
  TooManyRequestsFailure,
  UnauthorizedFailure,
  UnprocessableFailure,
  type Failure,
} from '@core/failure';
import type {
  InstagramGraphInterface,
  InstagramMediaData,
  InstagramMediaPage,
  InstagramProfileData,
  InstagramTokenData,
} from '@application/instagram/ports/instagram-graph-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export type GraphFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface InstagramGraphConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly redirectUri: string;
}

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';
const VERSION = 'v23.0';
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages'];
const MEDIA_FIELDS = 'id,media_type,media_url,thumbnail_url,caption,permalink,timestamp';
const TIMEOUT_MS = 8_000;
const HTTP_TOO_MANY = 429;
/** Graph error codes for "slow down": app, user, page-level and Instagram's own throttles. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
/** The token is invalid, expired or revoked. */
const TOKEN_CODES = new Set([102, 190, 463, 467]);
/** "Missing permission" — the user did not grant a scope; reconnecting fixes it. */
const PERMISSION_CODES = new Set([10, 200]);
/** The recipient cannot be messaged: unavailable person, outside the allowed window. */
const RECIPIENT_CODES = new Set([551]);
const RECIPIENT_SUBCODES = new Set([2534022, 2534014, 1545041]);
const MEDIA_NOT_FOUND_CODE = 100;

interface GraphError {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly message: string;
}

/**
 * **Instagram API with Instagram Login**, over `fetch`.
 *
 * @remarks
 * - Tokens travel in the `Authorization` header wherever Instagram accepts it
 *   (the token-exchange endpoints insist on a query parameter); URLs are never
 *   logged, only Graph error codes.
 * - Every refusal is classified into the failure the callers act on (see
 *   `InstagramGraphInterface`); nothing throws.
 */
export class InstagramGraphClient implements InstagramGraphInterface {
  constructor(
    private readonly config: InstagramGraphConfig,
    private readonly fetchImpl: GraphFetch = (url, init) => fetch(url, init),
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<Result<{ readonly accessToken: string }, Failure>> {
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
      code,
    });
    const answer = await this.call(TOKEN_URL, { method: 'POST', body });
    if (!answer.ok) return answer;
    // Answered either flat or wrapped in `data: [...]`, depending on the rollout.
    const data = Array.isArray(answer.value.data) ? (answer.value.data[0] as Record<string, unknown> | undefined) : answer.value;
    const token = data?.access_token;
    return typeof token === 'string' ? ok({ accessToken: token }) : unreadable('exchange');
  }

  async longLived(shortToken: string): Promise<Result<InstagramTokenData, Failure>> {
    const params = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: this.config.appSecret, access_token: shortToken });
    return this.token(await this.call(`${GRAPH}/access_token?${params.toString()}`, { method: 'GET' }));
  }

  async refresh(token: string): Promise<Result<InstagramTokenData, Failure>> {
    const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
    return this.token(await this.call(`${GRAPH}/refresh_access_token?${params.toString()}`, { method: 'GET' }));
  }

  async profile(token: string): Promise<Result<InstagramProfileData, Failure>> {
    const answer = await this.call(`${GRAPH}/${VERSION}/me?fields=id,user_id,username,media_count`, authed(token));
    if (!answer.ok) return answer;
    const { id, user_id: userId, username, media_count: mediaCount } = answer.value;
    if ((typeof userId !== 'string' && typeof userId !== 'number') || typeof username !== 'string') return unreadable('profile');
    return ok({
      igUserId: String(userId),
      appScopedId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
      username,
      mediaCount: typeof mediaCount === 'number' ? mediaCount : 0,
    });
  }

  async subscribeWebhooks(token: string): Promise<Result<void, Failure>> {
    const answer = await this.call(`${GRAPH}/${VERSION}/me/subscribed_apps?subscribed_fields=comments`, { ...authed(token), method: 'POST' });
    return answer.ok ? ok(undefined) : answer;
  }

  async listMedia(token: string, limit: number, after: string | null): Promise<Result<InstagramMediaPage, Failure>> {
    const params = new URLSearchParams({ fields: MEDIA_FIELDS, limit: String(limit), ...(after !== null ? { after } : {}) });
    const answer = await this.call(`${GRAPH}/${VERSION}/me/media?${params.toString()}`, authed(token));
    if (!answer.ok) return answer;
    const items = Array.isArray(answer.value.data) ? answer.value.data.flatMap((raw) => mediaOf(raw) ?? []) : [];
    const paging = answer.value.paging as { cursors?: { after?: unknown }; next?: unknown } | undefined;
    const next = typeof paging?.next === 'string' && typeof paging.cursors?.after === 'string' ? paging.cursors.after : null;
    return ok({ items, after: next });
  }

  async findMedia(token: string, mediaId: string): Promise<Result<InstagramMediaData | null, Failure>> {
    const answer = await this.call(`${GRAPH}/${VERSION}/${encodeURIComponent(mediaId)}?fields=${MEDIA_FIELDS}`, authed(token));
    if (!answer.ok) return answer.failure.messageKey === 'errors.instagram.media_not_found' ? ok(null) : answer;
    return ok(mediaOf(answer.value));
  }

  async sendPrivateReply(igUserId: string, token: string, commentId: string, text: string): Promise<Result<void, Failure>> {
    const answer = await this.call(`${GRAPH}/${VERSION}/${encodeURIComponent(igUserId)}/messages`, {
      ...authed(token),
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    });
    return answer.ok ? ok(undefined) : answer;
  }

  async replyToComment(token: string, commentId: string, text: string): Promise<Result<void, Failure>> {
    const params = new URLSearchParams({ message: text });
    const answer = await this.call(`${GRAPH}/${VERSION}/${encodeURIComponent(commentId)}/replies?${params.toString()}`, {
      ...authed(token),
      method: 'POST',
    });
    return answer.ok ? ok(undefined) : answer;
  }

  private token(answer: Result<Record<string, unknown>, Failure>): Result<InstagramTokenData, Failure> {
    if (!answer.ok) return answer;
    const { access_token: accessToken, expires_in: expiresIn } = answer.value;
    if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') return unreadable('token');
    return ok({ accessToken, expiresInSeconds: expiresIn });
  }

  private async call(url: string, init: RequestInit): Promise<Result<Record<string, unknown>, Failure>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      logger.warn({ reason: err instanceof Error ? err.message : String(err) }, 'instagram_graph_unreachable');
      return fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed'));
    }
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    if (response.ok && record.error === undefined) return ok(record);
    return fail(classify(response.status, graphError(record)));
  }
}

function authed(token: string): RequestInit {
  return { method: 'GET', headers: { Authorization: `Bearer ${token}` } };
}

function graphError(record: Record<string, unknown>): GraphError {
  const error = (typeof record.error === 'object' && record.error !== null ? record.error : {}) as Record<string, unknown>;
  return {
    code: typeof error.code === 'number' ? error.code : null,
    subcode: typeof error.error_subcode === 'number' ? error.error_subcode : null,
    message: typeof error.message === 'string' ? error.message : '',
  };
}

/** A Graph refusal as the failure its caller acts on. */
export function classify(status: number, error: GraphError): Failure {
  const { code, subcode } = error;
  logger.warn({ status, code, subcode }, 'instagram_graph_refused');
  if (status === HTTP_TOO_MANY || (code !== null && RATE_LIMIT_CODES.has(code))) return new TooManyRequestsFailure('errors.instagram.rate_limited');
  // Only a dead token expires the connection; a missing permission does not.
  if (code !== null && TOKEN_CODES.has(code)) return new UnauthorizedFailure('errors.instagram.token_invalid');
  if ((code !== null && RECIPIENT_CODES.has(code)) || (subcode !== null && RECIPIENT_SUBCODES.has(subcode))) {
    return new UnprocessableFailure('errors.instagram.recipient_unavailable');
  }
  if (code !== null && PERMISSION_CODES.has(code)) return new ForbiddenFailure('errors.instagram.permission_missing');
  if (code === MEDIA_NOT_FOUND_CODE) return new ServiceUnavailableFailure('errors.instagram.media_not_found');
  return new ServiceUnavailableFailure('errors.instagram.upstream_failed');
}

function mediaOf(raw: unknown): InstagramMediaData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string') return null;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const mediaType = str(m.media_type) ?? 'IMAGE';
  const timestamp = str(m.timestamp);
  return {
    id: m.id,
    mediaType,
    thumbnailUrl: mediaType === 'VIDEO' ? (str(m.thumbnail_url) ?? str(m.media_url)) : (str(m.media_url) ?? str(m.thumbnail_url)),
    caption: str(m.caption),
    permalink: str(m.permalink),
    timestamp: timestamp === null || Number.isNaN(Date.parse(timestamp)) ? null : new Date(timestamp),
  };
}

function unreadable(step: string): Result<never, Failure> {
  logger.warn({ step }, 'instagram_graph_unreadable_answer');
  return fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed'));
}
