import type { AssistantCaller } from '@domain/assistant/assistant-caller';

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
      /**
       * Who is waiting for a typed assistant turn. Set only by the message auth
       * middleware, from WHICH token it accepted — never from the body.
       */
      assistantCaller?: AssistantCaller;
    }
  }
}
export {};
