// Small builders every AdminJS resource definition shares. They live here, not
// in adminjs.ts, because the per-feature resource files need them too.

// Enum DB values are SCREAMING_SNAKE_CASE or lower_snake; render them as Title
// Case in the UI. 'MIDDLE_EASTERN' -> 'Middle Eastern'.
export function toLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function enumValues(values: readonly string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: toLabel(v) }));
}

// Binds RefCell to a model's relation field (see ref-cell.tsx for why it must
// be the relation field, e.g. `owner`, and never the scalar FK column).
export function refProperty(
  path: string,
  refResourceId: string,
  labelField: string,
  opts: { labelStrategy?: 'localizedJson'; maxLength?: number } = {},
) {
  return {
    [path]: {
      components: { list: 'RefCell', show: 'RefCell' },
      custom: { refResourceId, labelField, ...opts },
    },
  };
}

// The Recipe reference column must use labelStrategy 'localizedJson' — the
// recipe title is localized `name` JSON (an object), and rendering that object
// directly throws React error #31.
export const recipeRef = (path = 'recipe') =>
  refProperty(path, 'Recipe', 'name', { labelStrategy: 'localizedJson' });
export const userRef = (path: string) => refProperty(path, 'User', 'displayName');
export const commentRef = (path: string) => refProperty(path, 'Comment', 'body', { maxLength: 60 });

// A scalar FK column that a RefCell relation field covers is redundant in
// list/show (a UUID next to the same value's friendly link) but stays a
// searchable picker on edit and an exact-id filter.
export function fk() {
  return { isVisible: { list: false, show: false, edit: true, filter: true } };
}

// Show-only: managed by the app, never typed by hand.
export function readOnlyField() {
  return { isVisible: { list: false, show: true, edit: false, filter: false } };
}

// Read-only resources: join tables, audit logs, and records the app owns that
// the admin should inspect but not hand-edit.
export const readOnlyActions = {
  new: { isAccessible: false },
  edit: { isAccessible: false },
};

// Logs nobody should be able to erase either — bulkDelete too, or the list
// view could wipe the trail in one gesture.
export const immutableActions = {
  ...readOnlyActions,
  delete: { isAccessible: false },
  bulkDelete: { isAccessible: false },
};
