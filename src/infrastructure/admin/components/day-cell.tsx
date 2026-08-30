import React from 'react';
import { flat } from 'adminjs';
import { toIsoDay } from '../day-format';

// `AssistantUsage.day` is a Postgres `date` — a day bucket, with no time of day
// in it at all. Prisma hands it back as `2026-08-29T00:00:00.000Z`, AdminJS
// infers `datetime` from the JS Date and renders it in the viewer's zone, so an
// admin in Istanbul reads every row as "03:00" and reasonably concludes the
// timestamps are broken.
//
// The zone-proof formatting lives in day-format.ts so it can be tested without
// a React renderer, which this repo has no setup for.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function DayCell({ property, record }: Props) {
  const raw = flat.get(record?.params ?? {}, property.path);
  if (raw === undefined || raw === null || raw === '') {
    return <span style={{ color: '#6c757d' }}>—</span>;
  }
  return <span>{toIsoDay(raw)}</span>;
}
