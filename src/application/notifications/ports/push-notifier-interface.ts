import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, string>;
}

export interface PushNotifierInterface {
  sendToUser(recipientId: string, payload: PushPayload): Promise<Result<void, Failure>>;
}
