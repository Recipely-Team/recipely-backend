declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role?: string };
      locale?: string;
      /**
       * Which worker box authenticated on this request. Set only by
       * `workerAuth`, so a handler that reads it is by construction behind it.
       */
      workerId?: string;
    }
  }
}
export {};
