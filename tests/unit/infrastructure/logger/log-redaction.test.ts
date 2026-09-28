import { Writable } from 'node:stream';
import pino from 'pino';
import { LOG_REDACT_PATHS } from '@infrastructure/logger/pino-logger';

/**
 * The symptom: the API's request log printed the worker's shared secret and
 * the Cloudflare Access client secret in plain text, on every claim, every
 * five seconds per worker. Anyone with read access to the logs held the keys
 * that let a process pose as an import worker.
 */
const logged = (req: Record<string, unknown>): string => {
  let out = '';
  const sink = new Writable({
    write(chunk: Buffer, _e, done) {
      out += chunk.toString();
      done();
    },
  });
  pino({ redact: { paths: [...LOG_REDACT_PATHS], remove: true } }, sink).info({ req }, 'request completed');
  return out;
};

describe('request logs', () => {
  const headers = {
    'x-worker-secret': 'worker-secret-value',
    'cf-access-client-secret': 'access-secret-value',
    'cf-access-jwt-assertion': 'jwt-value',
    authorization: 'Bearer token-value',
    cookie: 'session=cookie-value',
    'x-worker-id': 'recipely-worker-1',
  };

  it.each(['worker-secret-value', 'access-secret-value', 'jwt-value', 'token-value', 'cookie-value'])(
    'never contain %s',
    (secret) => {
      expect(logged({ headers })).not.toContain(secret);
    },
  );

  it('still say which worker it was', () => {
    expect(logged({ headers })).toContain('recipely-worker-1');
  });
});
