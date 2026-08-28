import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IDeviceRepository, DeviceRecord } from '@application/devices/ports/i-device-repository';

export class ListMyDevicesUseCase {
  constructor(private readonly devices: IDeviceRepository) {}

  async execute(userId: string): Promise<Result<DeviceRecord[], Failure>> {
    return this.devices.listForUser(userId);
  }
}
