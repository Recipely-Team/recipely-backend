import React from 'react';
import { flat } from 'adminjs';

// Read-only view of Recipe.nutrition ({ protein?, carbs?, fat?, fiber? } grams).

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

const LABELS: Record<string, string> = {
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fiber: 'Fiber',
};

export default function NutritionShow({ property, record }: Props) {
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

  const entries = Object.entries(parsed).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v),
  ) as [string, number][];

  if (entries.length === 0) {
    return <span style={{ color: '#6c757d', fontStyle: 'italic' }}>No nutrition data</span>;
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '4px 0' }}>
      {entries.map(([key, value]) => (
        <span
          key={key}
          style={{
            padding: '4px 10px',
            background: '#e9ecef',
            borderRadius: '12px',
            fontSize: '13px',
            color: '#212529',
          }}
        >
          <strong>{LABELS[key] ?? key}:</strong> {value} g
        </span>
      ))}
    </div>
  );
}
