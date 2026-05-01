import type { Request, Response, NextFunction } from 'express';
import type { TranslationService } from '@application/i18n/translation-service';

export function createLocaleMiddleware(translationService: TranslationService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const locale = translationService.localeFromRequest(
      req.query.locale as string | undefined,
      req.headers['accept-language'],
    );
    req.locale = locale;
    next();
  };
}