import type { Request } from 'express';
import type { z } from 'zod';
import type { DeviceContextBodySchema } from '@presentation/validators/auth.validators';
import type { DeviceContext } from '@application/devices/ports/device-repository-interface';
import { clientIp } from '@presentation/middlewares/client-ip';

/**
 * The device a client declared, completed with what only the HTTP edge knows.
 *
 * @remarks
 * - **Why here.** The ip and user agent are read once at the edge and handed
 *   down as plain strings, so nothing HTTP-shaped crosses into `@application`.
 *   Login, registration, social auth and the `/me/devices` heartbeat all build
 *   the record the same way through this one function.
 */
export function deviceContextFromRequest(
  req: Request,
  device: z.infer<typeof DeviceContextBodySchema>,
  proxyDepth: number,
): DeviceContext {
  const { deviceId, platform, appVersion } = device;
  const ip = clientIp(req, proxyDepth);
  const userAgent = req.headers['user-agent'];
  return {
    deviceId,
    platform,
    ...(appVersion !== undefined ? { appVersion } : {}),
    ip,
    ...(userAgent !== undefined ? { userAgent } : {}),
  };
}
