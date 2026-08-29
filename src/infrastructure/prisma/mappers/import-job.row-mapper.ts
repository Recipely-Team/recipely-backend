import type { ImportJob as ImportJobRow } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { ImportJob } from '@domain/imports/import-job';
import { isImportJobStatus } from '@domain/imports/import-job-status';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export class ImportJobRowMapper {
  /**
   * @remarks
   * `status` is a plain text column, so the only thing standing between a
   * hand-edited row and a job in a state no code handles is this guard. A row
   * that fails it is corrupt rather than merely unexpected, so it is reported
   * as such instead of being coerced into `queued` — coercing would hand a
   * broken job straight back to a worker.
   */
  static toDomain(row: ImportJobRow): Result<ImportJob, Failure> {
    if (!isImportJobStatus(row.status)) {
      logger.error({ rowId: row.id, status: row.status }, 'ImportJobRowMapper: unknown status on DB row');
      return fail(new UnknownFailure(`Corrupt import_job row ${row.id}`));
    }

    return ok(
      ImportJob.restore({
        id: row.id,
        ownerId: row.ownerId,
        url: row.url,
        locale: row.locale,
        status: row.status,
        claimedBy: row.claimedBy,
        claimedAt: row.claimedAt,
        attempts: row.attempts,
        draftId: row.draftId,
        errorKey: row.errorKey,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }
}
