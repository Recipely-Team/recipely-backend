import type { NextFunction, Request, Response } from 'express';
import { TooManyRequestsFailure } from '@core/failure';
import { createRateLimitMiddleware } from '@presentation/middlewares/rate-limit-middleware';

const reqFor = (userId: string): Request =>
  ({ user: { id: userId }, ip: '127.0.0.1' }) as unknown as Request;

const makeRes = (): { res: Response; setHeader: jest.Mock } => {
  const setHeader = jest.fn();
  return { res: { setHeader } as unknown as Response, setHeader };
};

const opts = { windowMs: 60_000, max: 2, messageKey: 'errors.too_many_requests.ai_cooldown' };

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T00:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows up to `max` requests, then blocks with a TooManyRequestsFailure', () => {
    const mw = createRateLimitMiddleware(opts);
    const { res, setHeader } = makeRes();
    const next: NextFunction = jest.fn();

    mw(reqFor('u1'), res, next);
    mw(reqFor('u1'), res, next);
    mw(reqFor('u1'), res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect((next as jest.Mock).mock.calls[0][0]).toBeUndefined();
    expect((next as jest.Mock).mock.calls[1][0]).toBeUndefined();
    const blocked = (next as jest.Mock).mock.calls[2][0];
    expect(blocked).toBeInstanceOf(TooManyRequestsFailure);
    expect(blocked.code).toBe('too_many_requests');
    expect(blocked.messageKey).toBe(opts.messageKey);
    const retryAfter = Number(setHeader.mock.calls[0]?.[1]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('tracks each user independently', () => {
    const mw = createRateLimitMiddleware(opts);
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    mw(reqFor('u1'), res, next);
    mw(reqFor('u1'), res, next);
    mw(reqFor('u2'), res, next); // u2's first call — must pass

    expect((next as jest.Mock).mock.calls[2][0]).toBeUndefined();
  });

  it('resets the count after the window elapses', () => {
    const mw = createRateLimitMiddleware(opts);
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    mw(reqFor('u1'), res, next);
    mw(reqFor('u1'), res, next); // at limit

    jest.advanceTimersByTime(opts.windowMs + 1);

    mw(reqFor('u1'), res, next); // new window — passes
    expect((next as jest.Mock).mock.calls[2][0]).toBeUndefined();
  });
});
