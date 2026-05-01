import React, { useState } from 'react';

interface LanguageEntry {
  language: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface KeyValueInputProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (name: string, value: Record<string, string>) => void;
}

declare const AdminJS: { env?: { AVAILABLE_LANGUAGES?: string } };

export default function KeyValueInput({ property, onChange }: KeyValueInputProps) {
  const availableLanguages = (AdminJS?.env?.AVAILABLE_LANGUAGES ?? 'en,tr,de,fr,es,ar').split(',');
  const currentValue = (property.value ?? {}) as Record<string, string>;

  const [entries, setEntries] = useState<LanguageEntry[]>(() => {
    return availableLanguages.map((lang) => {
      const entry: LanguageEntry = { language: lang.trim(), value: currentValue[lang.trim()] ?? '' };
      return entry;
    });
  });

  const handleLanguageChange = (index: number, newValue: string) => {
    const entry = entries[index];
    if (!entry) return;
    const updatedEntry: LanguageEntry = { language: entry.language, value: newValue };
    const updated = [...entries];
    updated[index] = updatedEntry;
    setEntries(updated);

    const result: Record<string, string> = {};
    updated.forEach((e) => {
      if (e.value.trim()) {
        result[e.language] = e.value.trim();
      }
    });
    onChange(property.name, result);
  };

  const fieldLabel = property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1');

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        {fieldLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entries.map((entry, index) => {
          const isRequired = entry.language === 'en';
          const placeholder = isRequired
            ? `Enter ${entry.language.toUpperCase()} value *`
            : `Enter ${entry.language.toUpperCase()} value (optional)`;

          return (
            <div key={entry.language} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  minWidth: '40px',
                  padding: '4px 8px',
                  background: isRequired ? '#0d6efd' : '#e9ecef',
                  color: isRequired ? '#fff' : '#212529',
                  borderRadius: '16px',
                  fontWeight: 500,
                  fontSize: '11px',
                  textAlign: 'center',
                }}
              >
                {entry.language.toUpperCase()}
              </span>
              <input
                type="text"
                value={entry.value}
                onChange={(e) => handleLanguageChange(index, e.target.value)}
                placeholder={placeholder}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}