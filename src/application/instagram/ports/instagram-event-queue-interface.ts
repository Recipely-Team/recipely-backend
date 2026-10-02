import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface InstagramEventInput {
  readonly igUserId: string;
  readonly field: string;
  readonly payload: unknown;
  readonly eventTime: Date;
  /** One queued event per key (`comments:<comment id>`); a repeat is dropped. */
  readonly dedupeKey?: string;
}

export interface QueuedInstagramEvent extends InstagramEventInput {
  readonly id: string;
  /** Claims so far, this one included. */
  readonly attempts: number;
}

/**
 * Webhook changes waiting for the worker. The webhook only enqueues and
 * answers; Meta retries a slow endpoint, and a slow endpoint is what doing the
 * work inline would make.
 */
export interface InstagramEventQueueInterface {
  /** Queues the events, due at once (`now`), dropping any whose `dedupeKey` is already queued; answers how many were new. */
  enqueue(events: readonly InstagramEventInput[], now: Date): Promise<Result<number, Failure>>;
  /** Takes up to `limit` due events, oldest first, atomically (no two ticks get the same row). */
  claim(now: Date, limit: number): Promise<Result<QueuedInstagramEvent[], Failure>>;
  done(id: string, now: Date): Promise<Result<void, Failure>>;
  retryAt(id: string, at: Date, error: string): Promise<Result<void, Failure>>;
  failed(id: string, error: string, now: Date): Promise<Result<void, Failure>>;
  /** Deletes finished (done or failed) events processed before `before`; answers how many. */
  prune(before: Date): Promise<Result<number, Failure>>;
}
