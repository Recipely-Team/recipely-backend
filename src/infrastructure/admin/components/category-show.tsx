import React from 'react';
import { flat } from 'adminjs';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function CategoryShow({ property, record }: Props) {
  const rawValue = flat.get(record.params, property.path);

  // If value is a string (JSON), parse it; if already an object, use directly
  let parsed: Record<string, unknown> = {};
  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      // If parse fails, treat as plain string value
      parsed = { en: rawValue };
    }
  } else if (rawValue && typeof rawValue === 'object') {
    parsed = rawValue as Record<string, unknown>;
  }

  const categoryName = parsed['en'] ? String(parsed['en']) : (Object.values(parsed)[0] ? String(Object.values(parsed)[0]) : '—');

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ color: '#6c757d', fontSize: '12px', fontWeight: 500, marginBottom: '2px' }}>
        {property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1')}
      </div>
      <div style={{ fontSize: '14px' }}>{categoryName}</div>
    </div>
  );
}