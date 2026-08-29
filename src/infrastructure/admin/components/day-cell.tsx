import React from 'react';
import { flat } from 'adminjs';

// `AssistantUsage.day` is a Postgres `date` — a day bucket, with no time of day
// in it at all. Prisma hands it back as `2026-08-29T00:00:00.000Z`, AdminJS
// infers `datetime` from the JS Date and renders it in the viewer's zone, so an
// admin in Istanbul reads every row as "03:00" and reasonably concludes the
// timestamps are broken.
//
// Slicing the ISO string is deliberate, and is why this is a component rather
// than `type: 'date'`: AdminJS's own date formatting is local-time based, so at
// a negative UTC offset midnight-UTC formats as the PREVIOUS day and the
// aggregate silently shifts by one. The first ten characters are the date the
// row was actually keyed on, in every zone.

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
  return <span>{String(raw).slice(0, 10)}</span>;
}
