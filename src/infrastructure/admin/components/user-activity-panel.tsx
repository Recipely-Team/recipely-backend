import React, { useEffect, useState } from 'react';
import { flat, ApiClient, ViewHelpers } from 'adminjs';

// A User's recipes/comments/favorites/devices/feedback, as a record-action tab
// (see the `activity` action on the User resource in adminjs.ts). AdminJS has
// no built-in embedded-child-list widget, so each section below fetches its
// own page directly through ApiClient.resourceAction rather than relying on
// anything the User record itself carries.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

interface ColumnConfig {
  key: string;
  label: string;
  // `name`/`body` fields that are localized JSON ({ en: '...', tr: '...' }).
  localized?: boolean;
  // Pull a readable label off a populated relation instead of `key` itself,
  // e.g. Favorite has no title of its own — show the recipe it points at.
  populatedPath?: string;
  truncate?: number;
  boolean?: boolean;
}

interface SectionConfig {
  title: string;
  resourceId: string;
  filterKey: string;
  sortBy: string;
  columns: ColumnConfig[];
}

const SECTIONS: SectionConfig[] = [
  {
    title: 'Recipes',
    resourceId: 'Recipe',
    filterKey: 'ownerId',
    sortBy: 'createdAt',
    columns: [
      { key: 'name', label: 'Name', localized: true },
      { key: 'isPublished', label: 'Published', boolean: true },
      { key: 'moderationStatus', label: 'Moderation' },
      { key: 'createdAt', label: 'Created' },
    ],
  },
  {
    title: 'Comments',
    resourceId: 'Comment',
    filterKey: 'authorId',
    sortBy: 'createdAt',
    columns: [
      { key: 'body', label: 'Body', truncate: 80 },
      { key: 'recipe', label: 'On recipe', populatedPath: 'recipe' },
      { key: 'moderationStatus', label: 'Moderation' },
      { key: 'createdAt', label: 'Created' },
    ],
  },
  {
    title: 'Favorites',
    resourceId: 'Favorite',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [
      { key: 'recipe', label: 'Recipe', populatedPath: 'recipe' },
      { key: 'createdAt', label: 'Created' },
    ],
  },
  {
    title: 'Devices',
    resourceId: 'Device',
    filterKey: 'userId',
    sortBy: 'lastLoginAt',
    columns: [
      { key: 'platform', label: 'Platform' },
      { key: 'appVersion', label: 'App version' },
      { key: 'lastLoginAt', label: 'Last login' },
    ],
  },
  {
    title: 'Feedback',
    resourceId: 'Feedback',
    filterKey: 'userId',
    sortBy: 'createdAt',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
      { key: 'subject', label: 'Subject' },
      { key: 'createdAt', label: 'Created' },
    ],
  },
];

const PAGE_SIZE = 10;
const api = new ApiClient();

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellValue(row: any, col: ColumnConfig): string {
  if (col.populatedPath) {
    const populated = row.populated?.[col.populatedPath];
    const name = populated ? localizedText(flat.get(populated.params ?? {}, 'name')) : null;
    return name ?? '—';
  }
  const raw = flat.get(row.params ?? {}, col.key);
  if (raw === undefined || raw === null || raw === '') return '—';
  if (col.boolean) return raw ? 'Yes' : 'No';
  if (col.localized) return localizedText(raw) ?? '—';
  if (col.truncate && typeof raw === 'string' && raw.length > col.truncate) {
    return `${raw.slice(0, col.truncate).trimEnd()}…`;
  }
  return String(raw);
}

function ActivitySection({ userId, section }: { userId: string; section: SectionConfig }) {
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
          [`filters.${section.filterKey}`]: userId,
          perPage: PAGE_SIZE,
          sortBy: section.sortBy,
          direction: 'desc',
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
  }, [userId, section.resourceId, section.filterKey, section.sortBy]);

  const listHref = new ViewHelpers().listUrl(
    section.resourceId,
    `filters.${section.filterKey}=${encodeURIComponent(userId)}`,
  );

  return (
    <div style={{ marginBottom: '24px' }}>
      <h4 style={{ margin: '0 0 8px' }}>
        {section.title}
        {total > 0 ? ` (${String(total)})` : ''}
      </h4>
      {failed && <div style={{ color: '#F28B82' }}>Failed to load {section.title.toLowerCase()}.</div>}
      {!failed && rows === null && <div style={{ color: '#6c757d' }}>Loading…</div>}
      {!failed && rows !== null && rows.length === 0 && (
        <div style={{ color: '#6c757d', fontStyle: 'italic' }}>None</div>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > PAGE_SIZE && (
        <a href={listHref} style={{ color: '#4268F6', fontSize: '12px' }}>
          View all {total} →
        </a>
      )}
    </div>
  );
}

export default function UserActivityPanel({ record }: Props) {
  const userId = record?.id;
  if (!userId) {
    return <span style={{ color: '#6c757d' }}>No record</span>;
  }
  return (
    <div style={{ padding: '16px' }}>
      {SECTIONS.map((section) => (
        <ActivitySection key={section.title} userId={String(userId)} section={section} />
      ))}
    </div>
  );
}
