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

  // Track which optional languages are visible (EN is always visible)
  const [visibleLangs, setVisibleLangs] = useState<Set<string>>(() => {
    const initial = new Set<string>(['en']);
    // If there are existing translations, show them
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

  const toggleLang = (lang: string) => {
    const newVisible = new Set(visibleLangs);
    if (newVisible.has(lang)) {
      // Don't hide EN
      if (lang !== 'en') {
        newVisible.delete(lang);
      }
    } else {
      newVisible.add(lang);
    }
    setVisibleLangs(newVisible);
  };

  const showAllOptional = () => {
    const allOptional = availableLanguages.filter((l) => l !== 'en');
    const newVisible = new Set(visibleLangs);
    allOptional.forEach((l) => newVisible.add(l));
    setVisibleLangs(newVisible);
  };

  const fieldLabel = property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1');
  const nonEnLanguages = availableLanguages.filter((l) => l !== 'en');
  const visibleNonEnCount = nonEnLanguages.filter((l) => visibleLangs.has(l)).length;

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        {fieldLabel}
      </div>

      {/* English - always visible and required */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span
          style={{
            minWidth: '40px',
            padding: '6px 10px',
            background: '#0d6efd',
            color: '#fff',
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
          value={entries.find((x) => x.language === 'en')?.value ?? ''}
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

      {/* Toggle button for additional languages */}
      {visibleNonEnCount < nonEnLanguages.length && (
        <button
          type="button"
          onClick={showAllOptional}
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
            marginBottom: '8px',
          }}
        >
          <span>+</span>
          <span>Add Translation ({visibleNonEnCount}/{nonEnLanguages.length})</span>
        </button>
      )}

      {/* Visible optional languages */}
      {nonEnLanguages.map((lang) => {
        if (!visibleLangs.has(lang)) return null;
        const colors = LANGUAGE_COLORS[lang] ?? { bg: '#e9ecef', text: '#212529' };
        const entry = entries.find((x) => x.language === lang);

        return (
          <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                minWidth: '40px',
                padding: '6px 10px',
                background: colors.bg,
                color: colors.text,
                borderRadius: '16px',
                fontWeight: 600,
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              {lang.toUpperCase()}
            </span>
            <input
              type="text"
              value={entry?.value ?? ''}
              onChange={(e) => handleLanguageChange(entries.findIndex((x) => x.language === lang), e.target.value)}
              placeholder={`${lang.toUpperCase()} (optional)`}
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
              onClick={() => toggleLang(lang)}
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
  );
}