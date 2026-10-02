import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramEventInput, InstagramEventQueueInterface } from '@application/instagram/ports/instagram-event-queue-interface';

const SECOND_MS = 1000;
/** The webhook fields the automations act on; anything else is acknowledged and dropped. */
const HANDLED_FIELDS: ReadonlySet<string> = new Set(['comments']);

/**
 * **`POST /webhooks/instagram`** (after the signature check) — queues each
 * comment change and answers at once.
 *
 * @remarks
 * - Meta retries a webhook that is slow or failing, so the work happens in
 *   the worker, not here; a payload that is not the shape expected is
 *   acknowledged with nothing queued, since a retry would not fix it.
 * - Each `entry` names the account (`id`) and when the change happened
 *   (`time`, seconds) — the clock the 7-day private-reply window is measured on.
 */
export class ReceiveInstagramWebhookUseCase {
  constructor(
    private readonly queue: InstagramEventQueueInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(payload: unknown): Promise<Result<number, Failure>> {
    const events = eventsOf(payload);
    if (events.length === 0) return ok(0);
    const queued = await this.queue.enqueue(events, this.now());
    return queued.ok ? ok(events.length) : queued;
  }
}

function eventsOf(payload: unknown): InstagramEventInput[] {
  if (!isRecord(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap((entry: unknown): InstagramEventInput[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !Array.isArray(entry.changes)) return [];
    const eventTime = typeof entry.time === 'number' ? new Date(entry.time * SECOND_MS) : new Date();
    const igUserId = entry.id;
    return entry.changes.flatMap((change: unknown): InstagramEventInput[] =>
      isRecord(change) && typeof change.field === 'string' && HANDLED_FIELDS.has(change.field) && isRecord(change.value)
        ? [{ igUserId, field: change.field, payload: change.value, eventTime }]
        : [],
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
