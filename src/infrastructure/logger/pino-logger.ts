import pino from 'pino';
import type { ILogger } from '@application/ports/i-logger';

export const pinoInstance = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'res.headers["set-cookie"]'],
    remove: true,
  },
});

export class PinoLogger implements ILogger {
  warn(context: Record<string, unknown>, message: string): void {
    pinoInstance.warn(context, message);
  }
}
