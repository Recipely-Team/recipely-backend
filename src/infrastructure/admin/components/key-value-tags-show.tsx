import React from 'react';
import { flat } from 'adminjs';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function KeyValueTagsShow({ property, record }: Props) {
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

  const fieldLabel = property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1');

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ color: '#6c757d', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
        {fieldLabel}
      </div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {Object.entries(parsed).map(([lang, items]) => {
          if (Array.isArray(items)) {
            return items.map((item, idx) => (
              <span
                key={`${lang}-${idx}`}
                style={{
                  padding: '2px 8px',
                  background: '#e9ecef',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#212529',
                }}
              >
                {String(item)}
              </span>
            ));
          }
          return null;
        })}
      </div>
    </div>
  );
}