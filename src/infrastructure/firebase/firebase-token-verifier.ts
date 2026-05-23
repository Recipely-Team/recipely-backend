import * as https from 'https';
import * as http from 'http';
import jwt from 'jsonwebtoken';
import type {
  FirebaseTokenPayload,
  IFirebaseTokenVerifier,
} from '@application/auth/ports/i-firebase-token-verifier';

// WHY: Firebase recommends the x509 PEM endpoint for RS256 ID-token verification;
// the standard JWKS endpoint is for OAuth access tokens.
const JWKS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface CachedKeys {
  keys: Record<string, string>;
  expiresAt: number;
}

let keyCache: CachedKeys | null = null;

const fetchKeys = (): Promise<Record<string, string>> =>
  new Promise((resolve, reject) => {
    const req = https.get(JWKS_URL, (res: http.IncomingMessage) => {
      let raw = '';
      res.on('data', (chunk: string) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const keys = JSON.parse(raw) as Record<string, string>;
          const cc = (res.headers['cache-control'] as string | undefined) ?? '';
          const maxAge = parseInt(cc.match(/max-age=(\d+)/)?.[1] ?? '3600', 10);
          keyCache = { keys, expiresAt: Date.now() + maxAge * 1000 };
          resolve(keys);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });

const getKeys = (): Promise<Record<string, string>> => {
  if (keyCache && Date.now() < keyCache.expiresAt) {
    return Promise.resolve(keyCache.keys);
  }
  return fetchKeys();
};

export class FirebaseTokenVerifier implements IFirebaseTokenVerifier {
  constructor(private readonly projectId: string) {}

  async verify(idToken: string): Promise<FirebaseTokenPayload> {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    const kid = decoded.header.kid as string | undefined;
    if (!kid) throw new Error('Token is missing key ID');

    const keys = await getKeys();
    const publicKey = keys[kid];
    if (!publicKey) throw new Error('Unknown signing key');

    const payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${this.projectId}`,
      audience: this.projectId,
    }) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      firebase?: { sign_in_provider?: string };
    };

    return {
      uid: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      signInProvider: payload.firebase?.sign_in_provider ?? 'unknown',
    };
  }
}
