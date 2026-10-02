import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { ConnectStateSignerInterface } from '@application/instagram/ports/connect-state-signer-interface';
import { instagramNotConfigured } from '@application/instagram/instagram-not-configured';
import { isAllowedReturnTo } from '@application/instagram/connect/connect-return-to';

export interface StartInstagramConnectInput {
  readonly userId: string;
  /** The app deep link (or web page) the callback returns to. */
  readonly returnTo: string;
}

/**
 * **`GET /auth/instagram/start`** — the instagram.com consent URL for the
 * signed-in user. The app opens it in a browser; Instagram sends the browser
 * to our callback with a code and the signed `state` minted here, which names
 * the user and the return link.
 */
export class StartInstagramConnectUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly state: ConnectStateSignerInterface,
  ) {}

  async execute(input: StartInstagramConnectInput): Promise<Result<{ readonly url: string }, Failure>> {
    if (this.graph === null) return fail(instagramNotConfigured());
    if (!isAllowedReturnTo(input.returnTo)) {
      return fail(new ValidationFailure('errors.validation.instagram_return_invalid', 'returnTo'));
    }
    const state = await this.state.sign({ userId: input.userId, returnTo: input.returnTo });
    return ok({ url: this.graph.authorizeUrl(state) });
  }
}
