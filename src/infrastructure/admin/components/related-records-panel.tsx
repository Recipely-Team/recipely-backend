import React, { useEffect, useState } from 'react';
import { flat, ApiClient, ViewHelpers } from 'adminjs';
import {
  Box,
  H4,
  Link,
  Loader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Text,
} from '@adminjs/design-system';

// Every record's child rows (a user's recipes, a recipe's comments, a food's
// variants, ...), as a record-action tab. AdminJS has no embedded child-list
// widget, so each section fetches its own page through
// ApiClient.resourceAction. WHAT to show — sections and page size — comes from
// the action's `custom` (see resources/related-sections.ts); colours and
// spacing come from the panel theme through the design-system components, so
// this file holds no resource name, colour or measurement of its own.

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

const EMPTY = '—';
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
    return label ? clip(label, col.truncate) : EMPTY;
  }
  const raw = flat.get(row.params ?? {}, col.key);
  if (raw === undefined || raw === null || raw === '') return EMPTY;
  if (col.boolean) return raw ? 'Yes' : 'No';
  if (col.localized) return clip(localizedText(raw) ?? EMPTY, col.truncate);
  if (Array.isArray(raw)) return clip(raw.join(', '), col.truncate);
  return clip(String(raw), col.truncate);
}

function RelatedSection({
  parentId,
  section,
  pageSize,
}: {
  parentId: string;
  section: SectionConfig;
  pageSize: number;
}) {
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
          perPage: pageSize,
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
  }, [parentId, pageSize, section.resourceId, section.filterKey, section.sortBy, section.direction]);

  const listHref = helpers.listUrl(
    section.resourceId,
    `filters.${section.filterKey}=${encodeURIComponent(parentId)}`,
  );

  return (
    <Box mb="xxl">
      <H4>{`${section.title} (${String(total)})`}</H4>
      {failed && <Text color="error">Failed to load {section.title.toLowerCase()}.</Text>}
      {!failed && rows === null && <Loader />}
      {!failed && rows !== null && rows.length === 0 && <Text color="grey60">None</Text>}
      {!failed && rows !== null && rows.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              {section.columns.map((col) => (
                <TableCell key={col.key}>{col.label}</TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {section.columns.map((col) => (
                  <TableCell key={col.key}>{cellValue(row, col)}</TableCell>
                ))}
                <TableCell>
                  <Link
                    href={helpers.recordActionUrl({
                      resourceId: section.resourceId,
                      recordId: String(row.id),
                      actionName: 'show',
                    })}
                  >
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {total > pageSize && (
        <Box mt="default">
          <Link href={listHref}>{`View all ${String(total)} →`}</Link>
        </Box>
      )}
    </Box>
  );
}

export default function RelatedRecordsPanel({ record, action }: Props) {
  const parentId = record?.id;
  const sections: SectionConfig[] = action?.custom?.sections ?? [];
  const pageSize: number = action?.custom?.pageSize;
  if (!parentId) {
    return <Text color="grey60">No record</Text>;
  }
  return (
    <Box p="xl">
      {sections.map((section) => (
        <RelatedSection
          key={section.title}
          parentId={String(parentId)}
          section={section}
          pageSize={pageSize}
        />
      ))}
    </Box>
  );
}
