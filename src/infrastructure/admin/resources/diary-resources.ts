import { MEAL_SLOTS } from '@domain/diary/meal-slot';
import type { ModelLookup } from '@infrastructure/admin/resources/model-lookup';
import {
  enumValues,
  fk,
  readOnlyActions,
  readOnlyField,
  recipeRef,
  refProperty,
  userRef,
} from '@infrastructure/admin/resources/resource-helpers';

// A user's food diary: what they logged, their water and their goals. Read-only
// (delete stays open): these are a person's own records, written by the app's
// diary use cases, and the admin is here to look, not to log on their behalf.
export function buildDiaryResources({ prisma, modelByName }: ModelLookup) {
  const navigation = { name: 'Diary', icon: 'Calendar' };
  const day = { components: { list: 'DayCell', show: 'DayCell' } };

  const foodLogEntry = {
    resource: { model: modelByName('FoodLogEntry'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'date', 'meal', 'name', 'servings', 'calories', 'createdAt'],
      filterProperties: ['userId', 'date', 'meal', 'recipeId', 'foodVariantId', 'productSource', 'createdAt'],
      showProperties: [
        'id', 'user', 'date', 'meal', 'name', 'servings', 'unitKey', 'unitAmount', 'calories',
        'protein', 'carbs', 'fat', 'fiber', 'recipe', 'foodVariant', 'productSource', 'offBarcode',
        'createdAt', 'updatedAt',
      ],
      properties: {
        ...userRef('user'),
        ...recipeRef(),
        ...refProperty('foodVariant', 'FoodVariant', 'names', { labelStrategy: 'localizedJson' }),
        userId: fk(),
        recipeId: fk(),
        foodVariantId: fk(),
        date: day,
        meal: { availableValues: enumValues(MEAL_SLOTS), components: { list: 'EnumLabel', show: 'EnumLabel' } },
      },
      actions: { ...readOnlyActions },
    },
  };

  const diaryDayWater = {
    resource: { model: modelByName('DiaryDayWater'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'date', direction: 'desc' as const },
      listProperties: ['user', 'date', 'glasses'],
      filterProperties: ['userId', 'date'],
      properties: { ...userRef('user'), userId: fk(), date: day },
      actions: { ...readOnlyActions },
    },
  };

  const nutritionGoals = {
    resource: { model: modelByName('NutritionGoals'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'updatedAt', direction: 'desc' as const },
      listProperties: ['user', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'waterGlasses', 'updatedAt'],
      filterProperties: ['userId', 'updatedAt'],
      properties: { ...userRef('user'), userId: fk(), updatedAt: readOnlyField() },
      actions: { ...readOnlyActions },
    },
  };

  return [foodLogEntry, diaryDayWater, nutritionGoals];
}
