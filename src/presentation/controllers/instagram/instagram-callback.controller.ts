import type { Request, Response } from 'express';
import type { ReceiveInstagramAuthorizationUseCase } from '@application/instagram/connect/receive-instagram-authorization-use-case';
import { withOutcome } from '@application/instagram/connect/connect-return-to';
import { InstagramCallbackStatus } from '@application/instagram/connect/instagram-connect-outcome';
import { InstagramCallbackQuerySchema } from '@presentation/validators/instagram.validators';

const FOUND = 302;
const BAD_REQUEST = 400;
const UNAVAILABLE = 503;

/**
 * **`GET /auth/instagram/callback`** — the browser lands here from instagram.com
 * (outside the API envelope: it is a plain redirect, not an app request).
 *
 * @remarks
 * - Success or a reportable error redirects (302) to the app's return link
 *   with `status=authorized&code=…` (the app finalises with its session) or
 *   `status=error&reason=denied|failed`.
 * - With no trustworthy return link (missing, expired or forged `state`), a
 *   short plain-text page says to go back to the app; nothing is redirected
 *   to an address the request itself supplied.
 */
export class InstagramCallbackController {
  constructor(private readonly receive: ReceiveInstagramAuthorizationUseCase) {}

  callback = async (req: Request, res: Response): Promise<void> => {
    const parsed = InstagramCallbackQuerySchema.safeParse(req.query);
    const query = parsed.success ? parsed.data : {};
    const result = await this.receive.execute({
      ...(query.code !== undefined ? { code: query.code } : {}),
      ...(query.state !== undefined ? { state: query.state } : {}),
      ...(query.error !== undefined ? { error: query.error } : {}),
    });
    res.setHeader('Cache-Control', 'no-store');
    if (!result.ok) {
      const unavailable = result.failure.code === 'service_unavailable';
      res
        .status(unavailable ? UNAVAILABLE : BAD_REQUEST)
        .type('text/plain')
        .send(unavailable ? 'Instagram connection is not available right now.' : 'This link has expired. Please go back to Recipely and try again.');
      return;
    }
    const outcome = result.value;
    const params: Record<string, string> =
      outcome.status === InstagramCallbackStatus.Authorized
        ? { status: outcome.status, code: outcome.code }
        : { status: outcome.status, reason: outcome.reason };
    res.redirect(FOUND, withOutcome(outcome.returnTo, params));
  };
}
