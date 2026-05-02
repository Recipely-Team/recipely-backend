import React from 'react';
import { flat } from 'adminjs';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function KeyValueIngredientsShow({ property, record }: Props) {
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
      {Object.entries(parsed).map(([lang, items]) => {
        if (!Array.isArray(items)) return null;
        return (
          <div key={lang} style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: '#adb5bd', marginBottom: '2px' }}>{lang.toUpperCase()}</div>
            <ul style={{ margin: '0 0 0 20px', padding: '0', fontSize: '13px' }}>
              {items.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '2px' }}>{String(item)}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}