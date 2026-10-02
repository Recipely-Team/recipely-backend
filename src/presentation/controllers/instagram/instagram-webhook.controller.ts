import type { Request, Response } from 'express';
import type { MetaSignatureVerifierInterface } from '@application/instagram/ports/meta-signature-verifier-interface';
import type { ReceiveInstagramWebhookUseCase } from '@application/instagram/delivery/receive-instagram-webhook-use-case';
import type { DeleteInstagramDataUseCase } from '@application/instagram/delivery/delete-instagram-data-use-case';
import type { LoggerInterface } from '@application/ports/logger-interface';

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const UNAVAILABLE = 503;
const SERVER_ERROR = 500;
const DELETION_STATUS_URL = 'https://recipely.net/privacy';

export interface InstagramWebhookConfig {
  /** `null` when Instagram is not configured on this server. */
  readonly verifier: MetaSignatureVerifierInterface | null;
  readonly verifyToken: string | null;
}

/**
 * **Meta's calls into Recipely** (outside the API envelope; Meta signs them).
 *
 * @remarks
 * - `GET /webhooks/instagram` answers the subscription challenge when
 *   `hub.verify_token` matches.
 * - `POST /webhooks/instagram` checks `X-Hub-Signature-256` over the RAW body
 *   (401 otherwise), queues the comments and answers 200 at once.
 * - `POST /webhooks/instagram/deauthorize` and `/data-deletion` verify the
 *   `signed_request` and forget the account (data deletion also erases its
 *   rules and history), answering the confirmation Meta expects.
 */
export class InstagramWebhookController {
  constructor(
    private readonly config: InstagramWebhookConfig,
    private readonly receive: ReceiveInstagramWebhookUseCase,
    private readonly deleteData: DeleteInstagramDataUseCase,
    private readonly logger: LoggerInterface,
  ) {}

  verify = (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (this.config.verifyToken !== null && mode === 'subscribe' && token === this.config.verifyToken && typeof challenge === 'string') {
      res.status(OK).type('text/plain').send(challenge);
      return;
    }
    res.sendStatus(FORBIDDEN);
  };

  event = async (req: Request, res: Response): Promise<void> => {
    if (this.config.verifier === null) {
      res.sendStatus(UNAVAILABLE);
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!this.config.verifier.verifyWebhook(raw, req.header('x-hub-signature-256'))) {
      res.sendStatus(UNAUTHORIZED);
      return;
    }
    let payload: unknown = null;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      payload = null;
    }
    const queued = await this.receive.execute(payload);
    if (!queued.ok) {
      // A 5xx makes Meta deliver it again later, which is what a full or failing queue wants.
      this.logger.warn({ messageKey: queued.failure.messageKey }, 'instagram_webhook_enqueue_failed');
      res.sendStatus(SERVER_ERROR);
      return;
    }
    res.status(OK).type('text/plain').send('EVENT_RECEIVED');
  };

  deauthorize = (req: Request, res: Response): Promise<void> => this.forget(req, res, false);

  dataDeletion = (req: Request, res: Response): Promise<void> => this.forget(req, res, true);

  private async forget(req: Request, res: Response, everything: boolean): Promise<void> {
    if (this.config.verifier === null) {
      res.sendStatus(UNAVAILABLE);
      return;
    }
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const signed = typeof body.signed_request === 'string' ? body.signed_request : '';
    const parsed = this.config.verifier.parseSignedRequest(signed);
    if (!parsed.ok) {
      res.sendStatus(UNAUTHORIZED);
      return;
    }
    const deleted = await this.deleteData.execute({ igUserId: parsed.value.igUserId, everything });
    if (!deleted.ok) {
      res.sendStatus(SERVER_ERROR);
      return;
    }
    const code = `ig-${parsed.value.igUserId}-${Date.now()}`;
    res.status(OK).json(everything ? { url: `${DELETION_STATUS_URL}?deletion=${code}`, confirmation_code: code } : { ok: true });
  }
}
