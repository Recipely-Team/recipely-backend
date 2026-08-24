/**
 * What the app needs to open a voice session, or to know it cannot.
 *
 * `token` is absent exactly when `budgetRemainingSec` is zero: the app falls
 * back to the text mode and never opens a socket, rather than opening one that
 * would be refused. Keeping the remaining budget on the refusal is what lets
 * the screen say *why* — a user out of their own allowance and a user caught by
 * the app-wide daily cap are told different things.
 */
export interface AssistantSessionDto {
  readonly token?: string;
  readonly model?: string;
  readonly wsUrl?: string;
  readonly expiresAt?: string;
  readonly budgetRemainingSec: number;
  readonly reason?: 'user_daily_limit' | 'global_daily_limit';
}
