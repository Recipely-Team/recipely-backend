import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IPushNotifier, PushPayload } from '@application/notifications/ports/i-push-notifier';
import type { IFcmTokenRepository } from '@application/notifications/ports/i-fcm-token-repository';
import { getFirebaseAdminApp } from '@infrastructure/firebase/firebase-admin-client';

export class FcmPushNotifier implements IPushNotifier {
  constructor(private readonly fcmTokenRepo: IFcmTokenRepository) {}

  async sendToUser(recipientId: string, payload: PushPayload): Promise<Result<void, Failure>> {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      // Firebase Admin not initialised — push notifications silently skipped.
      return ok(undefined);
    }

    const tokensResult = await this.fcmTokenRepo.getTokensForUser(recipientId);
    if (!tokensResult.ok || tokensResult.value.length === 0) {
      return ok(undefined);
    }

    try {
      await adminApp.messaging().sendEachForMulticast({
        tokens: tokensResult.value,
        notification: { title: payload.title, body: payload.body },
        ...(payload.data !== undefined ? { data: payload.data } : {}),
      });
    } catch {
      // Non-fatal: FCM errors should not propagate to the caller.
    }

    return ok(undefined);
  }
}
