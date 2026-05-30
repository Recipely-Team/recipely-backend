import React, { useState } from 'react';
import { flat } from 'adminjs';

// Editor for the Recipe.nutrition JSON column. Shape is a flat object of optional
// numbers: { protein?, carbs?, fat?, fiber? } (grams per serving). Empty fields are
// omitted from the emitted value so we never persist NaN/null for a macro the admin
// left blank.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: any;
  onChange: (name: string, value: Record<string, number>) => void;
}

const MACROS: { key: 'protein' | 'carbs' | 'fat' | 'fiber'; label: string }[] = [
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'fiber', label: 'Fiber (g)' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readInitial(property: { value?: unknown; path: string }, record?: any): Record<string, string> {
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

  const out: Record<string, string> = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v);
    });
  }
  return out;
}

export default function NutritionInput({ property, record, onChange }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => readInitial(property, record));

  const emit = (next: Record<string, string>) => {
    const result: Record<string, number> = {};
    Object.entries(next).forEach(([k, v]) => {
      const n = Number(v);
      if (v.trim() !== '' && Number.isFinite(n) && n >= 0) result[k] = n;
    });
    onChange(property.name, result);
  };

  const handleChange = (key: string, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    emit(next);
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        Nutrition (per serving)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        {MACROS.map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#6c757d' }}>{label}</label>
            <input
              type="number"
              min={0}
              step="any"
              value={values[key] ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="0"
              style={{
                width: '100px',
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
