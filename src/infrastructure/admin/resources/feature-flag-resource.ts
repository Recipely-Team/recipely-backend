import { FeatureFlagKey } from '@domain/flags/feature-flag-key';
import { FeatureFlagState } from '@domain/flags/feature-flag-state';
import type { ModelLookup } from '@infrastructure/admin/resources/model-lookup';
import { enumValues } from '@infrastructure/admin/resources/resource-helpers';

// Remote switches over the app's feature flags, served by GET /api/v1/flags.
// `Default` hands the decision back to the app's build-time value; `On`/`Off`
// override it for every client on its next launch. Key is a picker over the
// FeatureFlagKey vocabulary, so a typo cannot create a flag nothing reads.
// Delete stays closed — setting `Default` is the reversible way to stand down.
export function buildFeatureFlagResource({ prisma, modelByName }: ModelLookup) {
  return {
    resource: { model: modelByName('FeatureFlag'), client: prisma },
    options: {
      navigation: { name: 'System', icon: 'ToggleRight' },
      sort: { sortBy: 'key', direction: 'asc' as const },
      listProperties: ['key', 'state', 'description', 'updatedAt'],
      editProperties: ['key', 'state', 'description'],
      properties: {
        key: { availableValues: Object.values(FeatureFlagKey).map((value) => ({ value, label: value })) },
        state: {
          availableValues: enumValues(Object.values(FeatureFlagState)),
          components: { list: 'EnumLabel', show: 'EnumLabel' },
        },
        updatedAt: { isVisible: { list: true, show: true, edit: false, filter: false } },
      },
      actions: {
        delete: { isAccessible: false },
        bulkDelete: { isAccessible: false },
      },
    },
  };
}
