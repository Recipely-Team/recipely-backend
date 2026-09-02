import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { DeviceRepositoryInterface, DeviceRecord } from '@application/devices/ports/device-repository-interface';

export class ListMyDevicesUseCase {
  constructor(private readonly devices: DeviceRepositoryInterface) {}

  async execute(userId: string): Promise<Result<DeviceRecord[], Failure>> {
    return this.devices.listForUser(userId);
  }
}
