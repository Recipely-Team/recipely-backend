import React from 'react';
import { flat } from 'adminjs';

// Renders a SCREAMING_SNAKE_CASE enum value (cuisine, category, difficulty,
// moderationStatus) as a Title-Case label in list/show views, e.g.
// 'MIDDLE_EASTERN' -> 'Middle Eastern'. Without this AdminJS prints the raw
// DB value in the table.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

function toLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export default function EnumLabel({ property, record }: Props) {
  const raw = flat.get(record?.params ?? {}, property.path);
  if (raw === undefined || raw === null || raw === '') {
    return <span style={{ color: '#6c757d' }}>—</span>;
  }
  return <span>{toLabel(String(raw))}</span>;
}
