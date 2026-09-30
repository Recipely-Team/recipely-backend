/** What importing one curated file came to. Reported, never stored. */
export const CuratedImportStatus = {
  Created: 'created',
  Updated: 'updated',
  Skipped: 'skipped',
} as const;

export type CuratedImportStatusType = (typeof CuratedImportStatus)[keyof typeof CuratedImportStatus];
