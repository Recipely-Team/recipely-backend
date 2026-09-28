import pino from 'pino';
import type { LoggerInterface } from '@application/ports/logger-interface';

/**
 * Everything that must never reach a log line.
 *
 * The worker's shared secret and the Cloudflare Access client secret travel as
 * request headers on every claim — one every five seconds per worker — and
 * pino-http logs request headers in full. Both sat in plain text in the API
 * log until they were added here.
 */
export const LOG_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-worker-secret"]',
  'req.headers["cf-access-client-secret"]',
  'req.headers["cf-access-jwt-assertion"]',
  'req.body.password',
  'res.headers["set-cookie"]',
];

export const pinoInstance = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: { paths: [...LOG_REDACT_PATHS], remove: true },
});

export class PinoLogger implements LoggerInterface {
  warn(context: Record<string, unknown>, message: string): void {
    pinoInstance.warn(context, message);
  }
}
