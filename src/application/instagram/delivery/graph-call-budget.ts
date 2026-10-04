const HOUR_MS = 60 * 60 * 1000;

/**
 * **Graph calls the comment poller may make per Instagram account per hour.**
 * Instagram's rate limit is per account and shared with the private replies,
 * so the poller keeps to a slice of it and the DMs keep the rest. In memory:
 * one small entry per account polled within the hour.
 */
export class GraphCallBudget {
  private readonly windows = new Map<string, { start: number; used: number }>();

  constructor(private readonly perHour: number) {}

  /** Spends one call for the account, or answers false when its hour is used up. */
  take(account: string, now: Date): boolean {
    const at = now.getTime();
    const window = this.windows.get(account);
    if (window === undefined || at - window.start >= HOUR_MS) {
      this.windows.set(account, { start: at, used: 1 });
      return true;
    }
    if (window.used >= this.perHour) return false;
    window.used += 1;
    return true;
  }

  /** Forgets accounts whose hour has passed. */
  prune(now: Date): void {
    for (const [account, window] of this.windows) {
      if (now.getTime() - window.start >= HOUR_MS) this.windows.delete(account);
    }
  }
}
