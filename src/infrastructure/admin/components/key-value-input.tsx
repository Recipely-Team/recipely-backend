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

const LANGUAGE_COLORS: Record<string, { bg: string; text: string }> = {
  en: { bg: '#0d6efd', text: '#fff' },
  tr: { bg: '#e63946', text: '#fff' },
  de: { bg: '#f4a261', text: '#212529' },
  fr: { bg: '#2a9d8f', text: '#fff' },
  es: { bg: '#e9c46a', text: '#212529' },
  ar: { bg: '#6a4c93', text: '#fff' },
};

export default function KeyValueInput({ property, onChange }: KeyValueInputProps) {
  const availableLanguages = (AdminJS?.env?.AVAILABLE_LANGUAGES ?? 'en,tr,de,fr,es,ar').split(',');
  const currentValue = (property.value ?? {}) as Record<string, string>;
  const [expandedLangs, setExpandedLangs] = useState<Set<string>>(() => {
    const initial = new Set<string>(['en']);
    Object.keys(currentValue).forEach((k) => {
      if (k !== 'en' && currentValue[k]?.trim()) {
        initial.add(k);
      }
    });
    return initial;
  });

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

  const toggleLanguage = (lang: string) => {
    const newExpanded = new Set(expandedLangs);
    if (newExpanded.has(lang)) {
      newExpanded.delete(lang);
    } else {
      newExpanded.add(lang);
    }
    setExpandedLangs(newExpanded);
  };

  const fieldLabel = property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1');
  const nonEnLanguages = availableLanguages.filter((l) => l !== 'en');

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        {fieldLabel}
      </div>

      {/* English - always visible and required */}
      {entries.filter((e) => e.language === 'en').map((entry) => {
        const colors = LANGUAGE_COLORS['en'] ?? { bg: '#0d6efd', text: '#fff' };
        return (
          <div key={entry.language} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                minWidth: '40px',
                padding: '6px 10px',
                background: colors?.bg ?? '#0d6efd',
                color: colors?.text ?? '#fff',
                borderRadius: '16px',
                fontWeight: 600,
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              EN
            </span>
            <input
              type="text"
              value={entry.value}
              onChange={(e) => handleLanguageChange(entries.findIndex((x) => x.language === 'en'), e.target.value)}
              placeholder="Enter English value *"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
        );
      })}

      {/* Toggle button for additional languages */}
      <button
        type="button"
        onClick={() => toggleLanguage('__toggle__')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          background: 'transparent',
          border: '1px dashed #adb5bd',
          borderRadius: '4px',
          color: '#6c757d',
          fontSize: '13px',
          cursor: 'pointer',
          marginBottom: expandedLangs.size > 1 ? '8px' : '0',
        }}
      >
        <span>{expandedLangs.size > 1 ? '▼' : '▶'}</span>
        <span>Add Translation ({expandedLangs.size - 1} / {nonEnLanguages.length})</span>
      </button>

      {/* Collapsible additional languages */}
      {expandedLangs.size > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', borderLeft: '2px solid #e9ecef' }}>
          {entries.filter((e) => e.language !== 'en').map((entry) => {
            const isExpanded = expandedLangs.has(entry.language);
            const colors = LANGUAGE_COLORS[entry.language] ?? { bg: '#e9ecef', text: '#212529' };

            if (!isExpanded) return null;

            return (
              <div key={entry.language} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    minWidth: '40px',
                    padding: '6px 10px',
                    background: colors?.bg ?? '#e9ecef',
                    color: colors?.text ?? '#212529',
                    borderRadius: '16px',
                    fontWeight: 600,
                    fontSize: '12px',
                    textAlign: 'center',
                  }}
                >
                  {entry.language.toUpperCase()}
                </span>
                <input
                  type="text"
                  value={entry.value}
                  onChange={(e) => handleLanguageChange(entries.findIndex((x) => x.language === entry.language), e.target.value)}
                  placeholder={`Enter ${entry.language.toUpperCase()} value (optional)`}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => toggleLanguage(entry.language)}
                  style={{
                    padding: '4px 8px',
                    background: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    color: '#6c757d',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}