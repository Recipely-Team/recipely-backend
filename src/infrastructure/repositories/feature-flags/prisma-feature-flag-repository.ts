import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { FeatureFlag } from '@domain/feature-flags/feature-flag';
import { FeatureFlag as FeatureFlagEntity } from '@domain/feature-flags/feature-flag';
import type { IFeatureFlagRepository } from '@domain/feature-flags/i-feature-flag-repository';

export class PrismaFeatureFlagRepository implements IFeatureFlagRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<Result<FeatureFlag[], Failure>> {
    try {
      const rows = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
      return ok(rows.map(row => new FeatureFlagEntity({ key: row.key, enabled: row.enabled })));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getByKey(key: string): Promise<Result<FeatureFlag, Failure>> {
    try {
      const row = await this.prisma.featureFlag.findUnique({ where: { key } });
      if (!row) return fail(new NotFoundFailure(`FeatureFlag ${key} not found`));
      return ok(new FeatureFlagEntity({ key: row.key, enabled: row.enabled }));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async update(key: string, enabled: boolean): Promise<Result<FeatureFlag, Failure>> {
    try {
      const row = await this.prisma.featureFlag.upsert({
        where: { key },
        update: { enabled },
        create: { key, enabled },
      });
      return ok(new FeatureFlagEntity({ key: row.key, enabled: row.enabled }));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
