import type { NextFunction, Request, Response } from 'express';
import { publicReadCache } from '@presentation/middlewares/public-read-cache';

const run = (headers: Record<string, string>) => {
  const set: Record<string, string> = {};
  const varied: string[] = [];
  const res = {
    setHeader: (name: string, value: string) => {
      set[name] = value;
    },
    vary: (field: string) => varied.push(field),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  publicReadCache(30)({ headers } as Request, res, next);
  return { set, varied, next };
};

describe('publicReadCache', () => {
  it('lets a browser reuse a guest read, and serve it stale while it refetches', () => {
    const { set, next } = run({});

    expect(set['Cache-Control']).toBe('public, max-age=30, stale-while-revalidate=150');
    expect(next).toHaveBeenCalled();
  });

  it('never shares a signed-in read, which carries the viewer’s own flags', () => {
    expect(run({ authorization: 'Bearer t' }).set['Cache-Control']).toBe('private, no-cache');
  });

  it('keeps languages and callers apart', () => {
    expect(run({}).varied).toEqual(['Accept-Language', 'Authorization']);
  });
});
