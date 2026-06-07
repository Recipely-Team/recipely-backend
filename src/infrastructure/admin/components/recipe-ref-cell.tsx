import React from 'react';
import { flat } from 'adminjs';

// Renders a Recipe foreign-key reference (recipeId / generatedRecipeId) in
// list & show views. AdminJS's default reference cell prints the referenced
// record's *title*, but a Recipe's title is its localized `name` JSON
// (e.g. { tr: '...', en: '...' }) — rendering that object directly throws
// React error #31 ("objects are not valid as a React child"). This component
// pulls the populated recipe's name and shows a readable localized string.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

function localizedName(name: unknown): string | null {
  if (!name || typeof name !== 'object') return null;
  const obj = name as Record<string, unknown>;
  const preferred = obj['en'] ?? obj['tr'];
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export default function RecipeRefCell({ property, record }: Props) {
  const recipeId = flat.get(record?.params ?? {}, property.path);
  if (!recipeId) {
    return <span style={{ color: '#6c757d' }}>—</span>;
  }

  const populated = record?.populated?.[property.path];
  const name = populated ? localizedName(flat.get(populated.params ?? {}, 'name')) : null;
  const label = name ?? String(recipeId);

  const href = `/admin/resources/Recipe/records/${String(recipeId)}/show`;
  return (
    <a href={href} style={{ color: '#4268F6', textDecoration: 'none' }}>
      {label}
    </a>
  );
}
