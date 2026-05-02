import React from 'react';
import { flat } from 'adminjs';

interface ListProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function KeyValueList({ property, record }: ListProps) {
  const rawValue = flat.get(record.params, property.path);
  let parsed: Record<string, unknown> = {};

  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = {};
    }
  } else if (rawValue && typeof rawValue === 'object') {
    parsed = rawValue as Record<string, unknown>;
  }

  // Collect string entries
  const entries: [string, string][] = [];
  if (parsed && typeof parsed === 'object') {
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        entries.push([key, value.trim()]);
      }
    });
  }

  if (entries.length === 0) {
    return <span style={{ color: '#6c757d' }}>—</span>;
  }

  const enValue = parsed['en'] ? String(parsed['en']) : (entries[0]?.[1] ?? '—');
  const count = entries.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '14px' }}>{enValue}</span>
      {count > 1 && (
        <span
          style={{
            padding: '2px 6px',
            background: '#e9ecef',
            borderRadius: '10px',
            fontSize: '11px',
            color: '#6c757d',
          }}
        >
          +{count - 1}
        </span>
      )}
    </div>
  );
}