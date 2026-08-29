import React from 'react';
import { flat, ViewHelpers } from 'adminjs';

// Renders any FK relation (Recipe/User/Comment/...) as a readable link instead
// of a raw UUID, in list & show views. @adminjs/prisma exposes the *relation*
// field (e.g. `recipe`, `owner`, `author`) as the reference property — the
// scalar FK column (recipeId/ownerId/authorId) is auto-marked read-only and
// never registered as a separate reference — so every binding here targets a
// relation field name, configured per-property via `custom`:
//
//   { components: { list: 'RefCell', show: 'RefCell' },
//     custom: { refResourceId: 'User', labelField: 'displayName' } }
//
// `labelStrategy: 'localizedJson'` is needed for Recipe.name, which is stored
// as a localized JSON object ({ en: '...', tr: '...' }) rather than a plain
// string — rendering that object directly throws React error #31 ("objects
// are not valid as a React child").

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

interface RefCustom {
  refResourceId?: string;
  labelField?: string;
  labelStrategy?: 'localizedJson' | 'text';
  maxLength?: number;
}

function localizedText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const preferred = obj['en'] ?? obj['tr'];
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function truncate(value: string, maxLength?: number): string {
  if (!maxLength || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

export default function RefCell({ property, record }: Props) {
  const id = flat.get(record?.params ?? {}, property.path);
  if (!id) {
    return <span style={{ color: '#6c757d' }}>—</span>;
  }

  const custom = (property.custom ?? {}) as RefCustom;
  const labelField = custom.labelField ?? 'id';
  const strategy = custom.labelStrategy ?? 'text';

  const populated = record?.populated?.[property.path];
  const rawLabel = populated ? flat.get(populated.params ?? {}, labelField) : null;
  const resolved =
    strategy === 'localizedJson'
      ? localizedText(rawLabel)
      : typeof rawLabel === 'string'
        ? rawLabel
        : null;
  const label = truncate(resolved ?? String(id), custom.maxLength);

  if (!custom.refResourceId) {
    return <span>{label}</span>;
  }

  const href = new ViewHelpers().showUrl(custom.refResourceId, String(id));
  return (
    <a href={href} style={{ color: '#4268F6', textDecoration: 'none' }}>
      {label}
    </a>
  );
}
