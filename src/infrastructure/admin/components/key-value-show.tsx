import React from 'react';
import { flat } from 'adminjs';

interface ShowProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

const LANGUAGE_COLORS: Record<string, { bg: string; text: string }> = {
  en: { bg: '#0d6efd', text: '#fff' },
  tr: { bg: '#e63946', text: '#fff' },
  de: { bg: '#f4a261', text: '#212529' },
  fr: { bg: '#2a9d8f', text: '#fff' },
  es: { bg: '#e9c46a', text: '#212529' },
  ar: { bg: '#6a4c93', text: '#fff' },
};

export default function KeyValueShow({ property, record }: ShowProps) {
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

  // Filter to only string values
  const entries: [string, string][] = [];
  if (parsed && typeof parsed === 'object') {
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        entries.push([key, value.trim()]);
      }
    });
  }

  if (entries.length === 0) {
    return <span style={{ color: '#6c757d', fontStyle: 'italic' }}>No translations</span>;
  }

  const fieldLabel = property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1');

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '13px', fontWeight: 500 }}>
        {fieldLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {entries.map(([lang, val]) => {
          const colors = LANGUAGE_COLORS[lang] ?? { bg: '#e9ecef', text: '#212529' };
          return (
            <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  minWidth: '36px',
                  padding: '3px 8px',
                  background: colors.bg,
                  color: colors.text,
                  borderRadius: '12px',
                  fontWeight: 500,
                  fontSize: '11px',
                  textAlign: 'center',
                }}
              >
                {lang.toUpperCase()}
              </span>
              <span style={{ fontSize: '14px' }}>{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}