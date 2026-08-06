import type { Request, Response } from 'express';
import { workerAuth } from '@presentation/middlewares/worker-auth';

/**
 * This middleware is the only thing between the internet and "hand me the next
 * user's job". It runs on endpoints that have no user behind them, so there is
 * no second check further down to catch a mistake here.
 */

const SECRET = 'a'.repeat(48);

function run(headers: Record<string, string | undefined>) {
  const req = { headers } as unknown as Request;
  const res = {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end: jest.fn(),
  };
  const next = jest.fn();

  workerAuth(SECRET)(req, res as unknown as Response, next);

  return { req, res, next };
}

describe('workerAuth admits', () => {
  it('a caller with the right secret and a name', () => {
    const { next, req } = run({ 'x-worker-secret': SECRET, 'x-worker-id': 'worker-1' });

    expect(next).toHaveBeenCalled();
    expect(req.workerId).toBe('worker-1');
  });
});

describe('workerAuth rejects', () => {
  it.each([
    ['no secret at all', { 'x-worker-id': 'worker-1' }],
    ['a wrong secret', { 'x-worker-secret': 'b'.repeat(48), 'x-worker-id': 'worker-1' }],
    ['a correct prefix', { 'x-worker-secret': 'a'.repeat(47), 'x-worker-id': 'worker-1' }],
    ['the secret plus one byte', { 'x-worker-secret': `${SECRET}a`, 'x-worker-id': 'worker-1' }],
    ['an empty secret', { 'x-worker-secret': '', 'x-worker-id': 'worker-1' }],
    ['no worker name', { 'x-worker-secret': SECRET }],
    ['an empty worker name', { 'x-worker-secret': SECRET, 'x-worker-id': '' }],
    ['an absurd worker name', { 'x-worker-secret': SECRET, 'x-worker-id': 'w'.repeat(65) }],
  ])('%s', (_why, headers) => {
    const { next, res } = run(headers as Record<string, string>);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('says nothing about why — an explanation only helps the caller who has neither', () => {
    const { res } = run({ 'x-worker-secret': 'wrong' });

    expect(res.end).toHaveBeenCalledWith();
  });

  it('never sets a worker id on a rejected request', () => {
    const { req } = run({ 'x-worker-secret': 'wrong', 'x-worker-id': 'worker-1' });

    expect(req.workerId).toBeUndefined();
  });
});
