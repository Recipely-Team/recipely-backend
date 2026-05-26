import admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function initFirebaseAdmin(projectId: string, serviceAccountJson?: string): void {
  if (app) return;
  try {
    if (serviceAccountJson) {
      const credential = admin.credential.cert(
        JSON.parse(Buffer.from(serviceAccountJson, 'base64').toString('utf-8')) as admin.ServiceAccount,
      );
      app = admin.initializeApp({ credential, projectId }, 'recipely');
    } else {
      // Application Default Credentials fallback (useful when running on GCP).
      app = admin.initializeApp({ projectId }, 'recipely');
    }
  } catch {
    // Non-fatal: push notifications will be silently skipped when admin init fails.
    app = null;
  }
}

export function getFirebaseAdminApp(): admin.app.App | null {
  return app;
}
