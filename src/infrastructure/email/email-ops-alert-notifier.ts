import type { EmailSenderInterface } from '@application/auth/ports/email-sender-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { OpsAlertNotifierInterface, WaitingImportsAlert } from '@application/imports/ports/ops-alert-notifier-interface';

/**
 * Emails production alerts to `OPS_ALERT_EMAIL`. A failed send is logged and
 * dropped: the alert tick must keep running even when the mail server does not.
 */
export class EmailOpsAlertNotifier implements OpsAlertNotifierInterface {
  constructor(
    private readonly email: EmailSenderInterface,
    private readonly to: string,
    private readonly logger: LoggerInterface,
  ) {}

  async importsWaiting(alert: WaitingImportsAlert): Promise<void> {
    const lines = [
      `${String(alert.count)} import request(s) are waiting in production; the oldest for ${String(alert.oldestWaitMinutes)} minutes.`,
      'No import worker has picked them up. Check that a worker is running and points at https://api.recipely.net,',
      'and that its WORKER_SHARED_SECRET matches production.',
    ];
    try {
      await this.email.send({
        to: this.to,
        subject: `Recipely: ${String(alert.count)} import request(s) waiting ${String(alert.oldestWaitMinutes)} min`,
        text: `${lines.join('\n')}\n`,
        html: `<p>${lines.join('<br>')}</p>`,
      });
    } catch (err) {
      this.logger.warn({ count: alert.count, err: (err as Error).message }, 'ops_alert_send_failed');
    }
  }
}
