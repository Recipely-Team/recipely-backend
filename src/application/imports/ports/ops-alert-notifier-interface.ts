/** Import requests no worker has picked up: how many, and how long the oldest has waited. */
export interface WaitingImportsAlert {
  readonly count: number;
  readonly oldestWaitMinutes: number;
}

/**
 * Tells the team something in production needs a person — here, users'
 * import requests sitting in the queue. Never throws: an implementation logs
 * its own failures, because an alert that crashes the tick alerts nobody.
 */
export interface OpsAlertNotifierInterface {
  importsWaiting(alert: WaitingImportsAlert): Promise<void>;
}
