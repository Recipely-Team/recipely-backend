import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { logger } from '@presentation/server/logger';
import { createTestTranslationService } from '../../../helpers/translation';

jest.mock('@presentation/server/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

const warn = logger.warn as unknown as jest.Mock;
const error = logger.error as unknown as jest.Mock;

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

beforeEach(() => {
  warn.mockClear();
  error.mockClear();
});

describe('createErrorHandler — ZodError', () => {
  it('answers with a catalogue key and generic copy, never Zod prose', () => {
    const handler = createErrorHandler(createTestTranslationService());
    const req = makeReq();
    const { res, status, json } = makeRes();

    handler(multiIssueZodError(), req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0]?.[0];
    expect(body.error.code).toBe('validation');
    expect(body.error.messageKey).toBe('errors.validation.invalid_request');
    // Zod's own wording ("Invalid enum value", the rejected input) must not reach
    // the caller — only the field it belongs to.
    expect(body.error.field).toBe('cuisine');
    expect(body.error.message).not.toMatch(/enum|NOPE|expected/i);
  });

  it('still records every failing field — in the log, not the response', () => {
    const handler = createErrorHandler(createTestTranslationService());
    const req = makeReq();
    const { res } = makeRes();

    handler(multiIssueZodError(), req, res, jest.fn());

    // The point of the original fix — that a second simultaneously-invalid field
    // is not silently dropped — still holds; it is now diagnostics, not user copy.
    const [context] = warn.mock.calls[0] ?? [];
    expect(context.debug).toEqual(expect.stringContaining('cuisine'));
    expect(context.debug).toEqual(expect.stringContaining('category'));
  });

  it('reports the failing field for a single-issue error', () => {
    const handler = createErrorHandler(createTestTranslationService());
    const schema = z.object({ cuisine: z.enum(['TURKISH', 'ITALIAN']) });
    const result = schema.safeParse({ cuisine: 'NOPE' });
    if (result.success) throw new Error('expected schema to fail');
    const req = makeReq();
    const { res, status, json } = makeRes();

    handler(result.error, req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0]?.[0];
    expect(body.error.field).toBe('cuisine');
    expect(body.error.messageKey).toBe('errors.validation.invalid_request');
  });

  it('lets a validator opt into specific user copy by using a catalogue key', () => {
    const handler = createErrorHandler(createTestTranslationService());
    const schema = z.object({ prompt: z.string().min(1, 'errors.validation.prompt_required') });
    const result = schema.safeParse({ prompt: '' });
    if (result.success) throw new Error('expected schema to fail');
    const req = makeReq();
    const { res, json } = makeRes();

    handler(result.error, req, res, jest.fn());

    const body = json.mock.calls[0]?.[0];
    expect(body.error.messageKey).toBe('errors.validation.prompt_required');
    expect(body.error.message).toBe('Prompt is required');
  });
});

describe('createErrorHandler — arbitrary exceptions', () => {
  it('never leaks an exception message to the caller', () => {
    const handler = createErrorHandler(createTestTranslationService());
    const req = makeReq();
    const { res, status, json } = makeRes();

    handler(new Error('connect ECONNREFUSED 10.0.0.5:5432 — password=hunter2'), req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]?.[0];
    expect(body.error.messageKey).toBe('errors.internal.unexpected');
    expect(body.error.message).toBe('Something went wrong on our end. Please try again in a moment.');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    // …but the operator still gets it.
    expect(error).toHaveBeenCalled();
    const [context] = error.mock.calls[0] ?? [];
    expect(context.debug).toEqual(expect.stringContaining('ECONNREFUSED'));
  });
});
