import type { Request, Response } from 'express';
import type { MintAssistantSessionUseCase } from '@application/assistant/use-cases/mint-assistant-session-use-case';
import type { RecordAssistantUsageUseCase } from '@application/assistant/use-cases/record-assistant-usage-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import {
  AssistantHeartbeatBodySchema,
  MintAssistantSessionBodySchema,
} from '@presentation/validators/assistant.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

/**
 * Both endpoints answer 200 when the user is out of budget, which is
 * deliberate: an exhausted allowance is the expected outcome several times a
 * day and the app's response is to offer the text mode, not to show an error.
 * A 429 here would have been rendered as a failure for something working as
 * designed. The body says how many seconds remain and which limit was hit.
 */
export class AssistantController {
  constructor(
    private readonly mintSession: MintAssistantSessionUseCase,
    private readonly recordUsage: RecordAssistantUsageUseCase,
    private readonly ts: TranslationService,
  ) {}

  session = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const parsed = MintAssistantSessionBodySchema.parse(req.body);
    const result = await this.mintSession.execute({
      userId: user.id,
      languageCode: parsed.languageCode,
      ...(parsed.resumptionHandle !== undefined
        ? { resumptionHandle: parsed.resumptionHandle }
        : {}),
    });
    if (!result.ok) {
      this.sendFailure(req, res, result.failure);
      return;
    }
    res.status(200).json(result.value);
  };

  heartbeat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const parsed = AssistantHeartbeatBodySchema.parse(req.body);
    const result = await this.recordUsage.execute({ userId: user.id, seconds: parsed.seconds });
    if (!result.ok) {
      this.sendFailure(req, res, result.failure);
      return;
    }
    res.status(200).json(result.value);
  };

  private sendFailure(req: Request, res: Response, failure: Parameters<typeof failureToHttp>[0]): void {
    const locale = req.locale ?? 'en';
    const { status, body } = failureToHttp(failure, (key) => this.ts.t(key, locale), locale);
    res.status(status).json(body);
  }
}
