import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface AssistantMessageRequest {
  readonly message: string;
  readonly languageCode: string;
  /** One line of what the user is looking at, e.g. `screen=/recipes`. */
  readonly screenContext?: string;
}

export interface AssistantMessageReply {
  /** What to show the user. Empty when the model only acted. */
  readonly reply: string;
  /** The action the model chose, if it chose one. */
  readonly action?: { readonly name: string; readonly arg?: string };
}

/**
 * Port for answering one typed message.
 *
 * The text mode is not a lesser voice mode; it is the mode that still works
 * when voice cannot — out of budget, in a quiet room, on a bad connection. It
 * runs as a single request rather than a session, which is why it costs a
 * fraction of a spoken turn and needs no socket.
 */
export interface IAssistantResponder {
  answer(request: AssistantMessageRequest): Promise<Result<AssistantMessageReply, Failure>>;
}
