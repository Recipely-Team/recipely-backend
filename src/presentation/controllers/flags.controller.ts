import type { Request, Response } from 'express';
import type { GetFeatureFlagOverridesUseCase } from '@application/flags/use-cases/get-feature-flag-overrides-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import { failureToHttp } from '@presentation/http/failure-to-http';

export class FlagsController {
  constructor(
    private readonly getOverrides: GetFeatureFlagOverridesUseCase,
    private readonly ts: TranslationService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const result = await this.getOverrides.execute();
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json({ flags: result.value });
  };
}
