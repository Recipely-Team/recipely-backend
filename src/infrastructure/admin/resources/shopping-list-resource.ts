import type { ModelLookup } from '@infrastructure/admin/resources/model-lookup';
import { fk, readOnlyActions, readOnlyField, userRef } from '@infrastructure/admin/resources/resource-helpers';

// Users' shopping lists. Read-only (delete stays open), like the diary: these
// are a person's own notes, written by the app, and the admin is here to look.
export function buildShoppingListResource({ prisma, modelByName }: ModelLookup) {
  return {
    resource: { model: modelByName('ShoppingListItem'), client: prisma },
    options: {
      navigation: { name: 'Diary', icon: 'Calendar' },
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'label', 'quantity', 'unit', 'checked', 'recipeName', 'createdAt'],
      filterProperties: ['userId', 'checked', 'recipeId', 'createdAt'],
      showProperties: [
        'id', 'user', 'label', 'quantity', 'unit', 'checked', 'position', 'recipeId', 'recipeName',
        'createdAt', 'updatedAt',
      ],
      properties: { ...userRef('user'), userId: fk(), recipeId: readOnlyField(), updatedAt: readOnlyField() },
      actions: { ...readOnlyActions },
    },
  };
}
