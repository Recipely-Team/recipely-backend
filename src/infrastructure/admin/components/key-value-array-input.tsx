import React, { useState } from 'react';
import { flat } from 'adminjs';

// Multilingual ARRAY editor used for ingredients, instructions, tags, mealType
// and tips. Value shape on the wire is Record<string, string[]> keyed by locale
// (e.g. { en: ["2 eggs", "flour"], tr: ["2 yumurta", "un"] }). Each language is a
// textarea where every non-empty line becomes one array item. English is always
// visible and required; other locales are revealed on demand, mirroring the UX of
// KeyValueInput so the recipe form feels consistent across single- and multi-value
// localized fields.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: any;
  onChange: (name: string, value: Record<string, string[]>) => void;
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

// Read the persisted value the same way the *-show components do (flat.get on
// record.params), falling back to property.value. Tolerates both a JSON string
// and an already-parsed object, and coerces each locale's value into string[].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readInitial(property: { value?: unknown; path: string }, record?: any): Record<string, string[]> {
  let raw: unknown = flat.get(record?.params ?? {}, property.path);
  if (raw === undefined || raw === null || raw === '') raw = property.value;

  let parsed: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }

  const out: Record<string, string[]> = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.entries(parsed as Record<string, unknown>).forEach(([lang, items]) => {
      if (Array.isArray(items)) {
        out[lang] = items.map((i) => String(i)).filter((s) => s.trim().length > 0);
      }
    });
  }
  return out;
}

const linesToArray = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

export default function KeyValueArrayInput({ property, record, onChange }: Props) {
  const availableLanguages = (AdminJS?.env?.AVAILABLE_LANGUAGES ?? 'en,tr,de,fr,es,ar')
    .split(',')
    .map((l) => l.trim());

  const initial = readInitial(property, record);

  // Per-locale textarea text (newline-joined). Held as strings so the user can
  // type freely; converted to arrays only when emitting onChange.
  const [text, setText] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {};
    availableLanguages.forEach((lang) => {
      t[lang] = (initial[lang] ?? []).join('\n');
    });
    return t;
  });

  const [visibleLangs, setVisibleLangs] = useState<Set<string>>(() => {
    const v = new Set<string>(['en']);
    Object.keys(initial).forEach((k) => {
      if (k !== 'en' && (initial[k]?.length ?? 0) > 0) v.add(k);
    });
    return v;
  });

  const emit = (next: Record<string, string>) => {
    const result: Record<string, string[]> = {};
    Object.entries(next).forEach(([lang, value]) => {
      const arr = linesToArray(value);
      if (arr.length > 0) result[lang] = arr;
    });
    onChange(property.name, result);
  };

  const handleChange = (lang: string, value: string) => {
    const next = { ...text, [lang]: value };
    setText(next);
    emit(next);
  };

  const toggleLang = (lang: string) => {
    const next = new Set(visibleLangs);
    if (next.has(lang)) {
      if (lang !== 'en') next.delete(lang);
    } else {
      next.add(lang);
    }
    setVisibleLangs(next);
  };

  const showAllOptional = () => {
    const next = new Set(visibleLangs);
    availableLanguages.filter((l) => l !== 'en').forEach((l) => next.add(l));
    setVisibleLangs(next);
  };

  const fieldLabel =
    property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1');
  const nonEn = availableLanguages.filter((l) => l !== 'en');
  const visibleNonEnCount = nonEn.filter((l) => visibleLangs.has(l)).length;

  const renderRow = (lang: string, required: boolean) => {
    const colors = LANGUAGE_COLORS[lang] ?? { bg: '#e9ecef', text: '#212529' };
    return (
      <div key={lang} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
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
        <textarea
          value={text[lang] ?? ''}
          onChange={(e) => handleChange(lang, e.target.value)}
          placeholder={required ? 'One item per line *' : `${lang.toUpperCase()} — one item per line (optional)`}
          rows={4}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        {!required && (
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
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        {fieldLabel}
        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#adb5bd' }}>(one item per line)</span>
      </div>

      {renderRow('en', true)}

      {visibleNonEnCount < nonEn.length && (
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
          <span>Add Translation ({visibleNonEnCount}/{nonEn.length})</span>
        </button>
      )}

      {nonEn.map((lang) => (visibleLangs.has(lang) ? renderRow(lang, false) : null))}
    </div>
  );
}
