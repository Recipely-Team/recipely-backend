import pino from 'pino';
import type { LoggerInterface } from '@application/ports/logger-interface';

export const pinoInstance = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'res.headers["set-cookie"]'],
    remove: true,
  },
});

export class PinoLogger implements LoggerInterface {
  warn(context: Record<string, unknown>, message: string): void {
    pinoInstance.warn(context, message);
  }
}
