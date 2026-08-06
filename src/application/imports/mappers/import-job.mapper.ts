import type { ImportJob } from '@domain/imports/import-job';
import type { ImportJobDto } from '@application/imports/dtos/import-job.dto';

export class ImportJobMapper {
  static toDto(job: ImportJob): ImportJobDto {
    return {
      id: job.id,
      status: job.status,
      draftId: job.draftId,
      errorKey: job.errorKey,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
