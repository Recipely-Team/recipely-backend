import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { TranslationService } from '@application/i18n/translation-service';
import { createErrorHandler } from '@presentation/middlewares/error-handler';

function makeTranslationService(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  } as unknown as TranslationService;
}

function makeReq(): Request {
  return { url: '/test', method: 'POST', locale: 'en' } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// Build a real ZodError with multiple simultaneous issues, matching the shape
// a multi-field-invalid recipe body would produce.
function multiIssueZodError(): ZodError {
  const schema = z.object({
    cuisine: z.enum(['TURKISH', 'ITALIAN']),
    category: z.enum(['SOUP', 'SALAD']),
  });
  const result = schema.safeParse({ cuisine: 'NOPE', category: 'ALSO_NOPE' });
  if (result.success) throw new Error('expected schema to fail');
  return result.error;
}

describe('createErrorHandler — ZodError with multiple failing fields', () => {
  it('surfaces every failing field in the response, not just the first', () => {
    const handler = createErrorHandler(makeTranslationService());
    const err = multiIssueZodError();
    const req = makeReq();
    const { res, status, json } = makeRes();

    handler(err, req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0]?.[0];
    // The previous behavior only ever surfaced err.issues[0] — dropping the
    // second failing field ("category") entirely. The fix must mention both.
    expect(body.error.message).toEqual(expect.stringContaining('cuisine'));
    expect(body.error.message).toEqual(expect.stringContaining('category'));
  });

  it('still reports a single failing field correctly (no regression)', () => {
    const handler = createErrorHandler(makeTranslationService());
    const schema = z.object({ cuisine: z.enum(['TURKISH', 'ITALIAN']) });
    const result = schema.safeParse({ cuisine: 'NOPE' });
    if (result.success) throw new Error('expected schema to fail');
    const req = makeReq();
    const { res, status, json } = makeRes();

    handler(result.error, req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0]?.[0];
    expect(body.error.field).toBe('cuisine');
    expect(body.error.message).toEqual(expect.stringContaining('cuisine'));
  });
});
