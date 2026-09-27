import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { DeviceContext, DeviceRepositoryInterface } from '@application/devices/ports/device-repository-interface';

interface RecordMyDeviceInput {
  readonly userId: string;
  readonly device: DeviceContext;
}

/**
 * Records the signed-in caller's device, or touches it when already known.
 *
 * @remarks
 * - **Why a heartbeat and not only login.** A session outlives the login that
 *   opened it, so a client that signed in before it sent device info would
 *   never appear. The app calls this once per start; `recordLogin` is an
 *   upsert on `(userId, deviceId)` that bumps `lastLoginAt`.
 */
export class RecordMyDeviceUseCase {
  constructor(private readonly devices: DeviceRepositoryInterface) {}

  async execute(input: RecordMyDeviceInput): Promise<Result<void, Failure>> {
    return this.devices.recordLogin({ userId: input.userId, ...input.device });
  }
}
