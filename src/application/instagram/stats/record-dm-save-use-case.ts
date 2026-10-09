import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmSendRepositoryInterface } from '@domain/instagram/dm-send-repository-interface';

export interface RecordDmSaveInput {
  readonly sendId: string;
  readonly recipeId: string;
}

/**
 * **`POST /me/instagram/dm-sends/:id/save`** — a signed-in user who arrived
 * through a DM saved its recipe. Counts only when the recipe is the one that
 * rule sends; like the open, every other case is answered the same way.
 */
export class RecordDmSaveUseCase {
  constructor(
    private readonly sends: DmSendRepositoryInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: RecordDmSaveInput): Promise<Result<void, Failure>> {
    const marked = await this.sends.markSaved(input.sendId, input.recipeId, this.now());
    return marked.ok ? ok(undefined) : marked;
  }
}
