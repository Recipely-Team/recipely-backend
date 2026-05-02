import React from 'react';

interface ListProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function KeyValueList({ property, record }: ListProps) {
  const rawValue = record.params?.[property.path];
  let parsed: Record<string, string> = {};

  // Handle both string and object formats
  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = {};
    }
  } else if (rawValue && typeof rawValue === 'object') {
    parsed = rawValue as Record<string, string>;
  }

  const entries = Object.entries(parsed).filter(([_, v]) => v && typeof v === 'string' && v.trim());

  if (entries.length === 0) {
    return <span style={{ color: '#6c757d' }}>—</span>;
  }

  // Show EN value, or first available
  const firstEntry = entries[0];
  const enValue = parsed['en'] || (firstEntry ? String(parsed[firstEntry[0]]) : undefined);
  const count = entries.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '14px' }}>{enValue as string}</span>
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