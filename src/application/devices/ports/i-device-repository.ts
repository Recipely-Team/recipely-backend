import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

/** The device context a client optionally attaches to a login. */
export interface DeviceContext {
  readonly deviceId: string;
  readonly platform: string;
  readonly appVersion?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface RecordLoginInput extends DeviceContext {
  readonly userId: string;
}

export interface DeviceRecord {
  readonly deviceId: string;
  readonly platform: string;
  readonly appVersion: string | null;
  readonly lastLoginAt: Date;
  readonly createdAt: Date;
}

export interface IDeviceRepository {
  recordLogin(input: RecordLoginInput): Promise<Result<void, Failure>>;
  listForUser(userId: string): Promise<Result<DeviceRecord[], Failure>>;
}
