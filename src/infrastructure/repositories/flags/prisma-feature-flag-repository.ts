import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  FeatureFlagRepositoryInterface,
  FeatureFlagSnapshot,
} from '@domain/flags/feature-flag-repository-interface';

export class PrismaFeatureFlagRepository implements FeatureFlagRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(): Promise<Result<readonly FeatureFlagSnapshot[], Failure>> {
    try {
      const rows = await this.prisma.featureFlag.findMany({ select: { key: true, state: true } });
      return ok(rows);
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }
}
