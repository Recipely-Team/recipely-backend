import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { PushNotifierInterface, PushPayload } from '@application/notifications/ports/push-notifier-interface';
import type { FcmTokenRepositoryInterface } from '@application/notifications/ports/fcm-token-repository-interface';
import { getFirebaseAdminApp } from '@infrastructure/firebase/firebase-admin-client';

export class FcmPushNotifier implements PushNotifierInterface {
  constructor(private readonly fcmTokenRepo: FcmTokenRepositoryInterface) {}

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
