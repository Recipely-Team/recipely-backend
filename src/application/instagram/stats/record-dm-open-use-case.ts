import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmSendRepositoryInterface } from '@domain/instagram/dm-send-repository-interface';

/**
 * **`POST /instagram/dm-sends/:id/open`** — someone opened the recipe link a
 * DM carried (`?dm=<id>`). Public, because the person who got the DM is
 * usually not signed in. Only the first open of a sent DM counts; any other id
 * is answered the same way, so the endpoint tells a caller nothing.
 */
export class RecordDmOpenUseCase {
  constructor(
    private readonly sends: DmSendRepositoryInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(sendId: string): Promise<Result<void, Failure>> {
    const marked = await this.sends.markOpened(sendId, this.now());
    return marked.ok ? ok(undefined) : marked;
  }
}
