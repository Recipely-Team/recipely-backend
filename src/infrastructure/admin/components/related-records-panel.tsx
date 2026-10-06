import React, { useEffect, useState } from 'react';
import { flat, ApiClient, ViewHelpers } from 'adminjs';

// Every record's child rows (a user's recipes, a recipe's comments, a food's
// variants, ...), as a record-action tab. AdminJS has no embedded child-list
// widget, so each section fetches its own page through
// ApiClient.resourceAction. WHAT to show comes from the action's `custom.sections`
// (see related-sections.ts) — this component knows no resource by name.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: any;
}

interface ColumnConfig {
  key: string;
  label: string;
  // `name`/`names` fields that are localized JSON ({ en: '...', tr: '...' }).
  localized?: boolean;
  // Read a label off a populated relation instead of `key` itself, e.g.
  // Favorite has no title of its own — show the recipe it points at.
  populatedPath?: string;
  populatedLabel?: string;
  truncate?: number;
  boolean?: boolean;
}

interface SectionConfig {
  title: string;
  resourceId: string;
  filterKey: string;
  sortBy: string;
  // Newest first unless a section is an ordered list (media, variants).
  direction?: 'asc' | 'desc';
  columns: ColumnConfig[];
}

const PAGE_SIZE = 10;
const MUTED = '#8CA0BC';
const api = new ApiClient();
const helpers = new ViewHelpers();

function localizedText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const preferred = obj['en'] ?? obj['tr'];
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function clip(text: string, max?: number): string {
  return max && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellValue(row: any, col: ColumnConfig): string {
  if (col.populatedPath) {
    const populated = row.populated?.[col.populatedPath];
    const label = populated
      ? localizedText(flat.get(populated.params ?? {}, col.populatedLabel ?? 'name'))
      : null;
    return label ? clip(label, col.truncate) : '—';
  }
  const raw = flat.get(row.params ?? {}, col.key);
  if (raw === undefined || raw === null || raw === '') return '—';
  if (col.boolean) return raw ? 'Yes' : 'No';
  if (col.localized) return clip(localizedText(raw) ?? '—', col.truncate);
  if (Array.isArray(raw)) return clip(raw.join(', '), col.truncate);
  return clip(String(raw), col.truncate);
}

function RelatedSection({ parentId, section }: { parentId: string; section: SectionConfig }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .resourceAction({
        resourceId: section.resourceId,
        actionName: 'list',
        params: {
          [`filters.${section.filterKey}`]: parentId,
          perPage: PAGE_SIZE,
          sortBy: section.sortBy,
          direction: section.direction ?? 'desc',
        },
      })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data.records ?? []);
        setTotal(response.data.meta?.total ?? response.data.records?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId, section.resourceId, section.filterKey, section.sortBy, section.direction]);

  const listHref = helpers.listUrl(
    section.resourceId,
    `filters.${section.filterKey}=${encodeURIComponent(parentId)}`,
  );

  return (
    <div style={{ marginBottom: '24px' }}>
      <h4 style={{ margin: '0 0 8px' }}>
        {section.title}
        {` (${String(total)})`}
      </h4>
      {failed && <div style={{ color: '#F28B82' }}>Failed to load {section.title.toLowerCase()}.</div>}
      {!failed && rows === null && <div style={{ color: MUTED }}>Loading…</div>}
      {!failed && rows !== null && rows.length === 0 && (
        <div style={{ color: MUTED, fontStyle: 'italic' }}>None</div>
      )}
      {!failed && rows !== null && rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {section.columns.map((col) => (
                <th
                  key={col.key}
                  style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #24374F' }}
                >
                  {col.label}
                </th>
              ))}
              <th style={{ borderBottom: '1px solid #24374F' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {section.columns.map((col) => (
                  <td key={col.key} style={{ padding: '4px 8px', borderBottom: '1px solid #1E3350' }}>
                    {cellValue(row, col)}
                  </td>
                ))}
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #1E3350', textAlign: 'right' }}>
                  <a
                    href={helpers.recordActionUrl({
                      resourceId: section.resourceId,
                      recordId: String(row.id),
                      actionName: 'show',
                    })}
                    style={{ color: '#60A5FA' }}
                  >
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > PAGE_SIZE && (
        <a href={listHref} style={{ color: '#60A5FA', fontSize: '12px' }}>
          View all {total} →
        </a>
      )}
    </div>
  );
}

export default function RelatedRecordsPanel({ record, action }: Props) {
  const parentId = record?.id;
  const sections: SectionConfig[] = action?.custom?.sections ?? [];
  if (!parentId) {
    return <span style={{ color: MUTED }}>No record</span>;
  }
  return (
    <div style={{ padding: '16px' }}>
      {sections.map((section) => (
        <RelatedSection key={section.title} parentId={String(parentId)} section={section} />
      ))}
    </div>
  );
}
