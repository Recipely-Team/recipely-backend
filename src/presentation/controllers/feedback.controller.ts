import type { Request, Response } from 'express';
import type { SubmitFeedbackUseCase } from '@application/feedback/use-cases/submit-feedback-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import { SubmitFeedbackBodySchema } from '@presentation/validators/feedback.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

export class FeedbackController {
  constructor(
    private readonly submitFeedback: SubmitFeedbackUseCase,
    private readonly ts: TranslationService,
  ) {}

  submit = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const user = requireUser(req);
    const parsed = SubmitFeedbackBodySchema.parse(req.body);
    const contactEmail = parsed.contactEmail ?? user.email;
    const result = await this.submitFeedback.execute({
      userId: user.id,
      category: parsed.category,
      message: parsed.message,
      contactEmail,
      ...(parsed.subject !== undefined ? { subject: parsed.subject } : {}),
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(201).json(result.value);
  };
}
