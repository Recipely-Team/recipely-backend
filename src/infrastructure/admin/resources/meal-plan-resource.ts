import type { ModelLookup } from '@infrastructure/admin/resources/model-lookup';
import { fk, readOnlyActions, readOnlyField, userRef } from '@infrastructure/admin/resources/resource-helpers';

// Users' meal plans. Read-only (delete stays open), like the diary: a person's
// own plan, written by the app, and the admin is here to look.
export function buildMealPlanResource({ prisma, modelByName }: ModelLookup) {
  return {
    resource: { model: modelByName('MealPlanEntry'), client: prisma },
    options: {
      navigation: { name: 'Diary', icon: 'Calendar' },
      sort: { sortBy: 'date', direction: 'desc' as const },
      listProperties: ['user', 'date', 'meal', 'recipeId', 'servings', 'foodLogEntryId', 'createdAt'],
      filterProperties: ['userId', 'date', 'meal', 'recipeId'],
      showProperties: [
        'id', 'user', 'date', 'meal', 'position', 'recipeId', 'servings', 'foodLogEntryId', 'createdAt', 'updatedAt',
      ],
      properties: {
        ...userRef('user'),
        userId: fk(),
        recipeId: readOnlyField(),
        foodLogEntryId: readOnlyField(),
        updatedAt: readOnlyField(),
      },
      actions: { ...readOnlyActions },
    },
  };
}
