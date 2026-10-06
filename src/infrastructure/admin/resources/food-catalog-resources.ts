import type { ModelLookup } from '@infrastructure/admin/resources/model-lookup';
import { fk, refProperty } from '@infrastructure/admin/resources/resource-helpers';
import { RelatedSections, relatedAction } from '@infrastructure/admin/resources/related-sections';

// The curated food catalog the diary searches. Editable so a wrong name or
// nutrient can be corrected, but new/delete stay closed: the catalog is
// generated (scripts/generate-food-catalog-migration.mjs), deleting a food
// cascades to its variants, and a hand-made row would vanish from the source
// the next regeneration starts from.
export function buildFoodCatalogResources({ prisma, modelByName }: ModelLookup) {
  const navigation = { name: 'Food catalog', icon: 'Coffee' };
  const localized = { components: { edit: 'KeyValueInput', show: 'KeyValueShow', list: 'KeyValueList' } };
  const curatedActions = {
    new: { isAccessible: false },
    delete: { isAccessible: false },
    bulkDelete: { isAccessible: false },
  };

  const foodCategory = {
    resource: { model: modelByName('FoodCategory'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'rank', direction: 'asc' as const },
      listProperties: ['key', 'names', 'rank'],
      properties: { names: localized },
      actions: { ...curatedActions, related: relatedAction(RelatedSections.foodCategory) },
    },
  };

  const food = {
    resource: { model: modelByName('Food'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'rank', direction: 'asc' as const },
      listProperties: ['names', 'slug', 'foodCategory', 'defaultUnit', 'rank'],
      filterProperties: ['slug', 'category', 'defaultUnit'],
      properties: {
        names: localized,
        ...refProperty('foodCategory', 'FoodCategory', 'names', { labelStrategy: 'localizedJson' }),
        category: fk(),
      },
      actions: { ...curatedActions, related: relatedAction(RelatedSections.food) },
    },
  };

  const foodVariant = {
    resource: { model: modelByName('FoodVariant'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'position', direction: 'asc' as const },
      listProperties: ['food', 'key', 'names', 'kcal', 'protein', 'carbs', 'fat', 'source'],
      filterProperties: ['foodId', 'key', 'source'],
      properties: {
        names: localized,
        ...refProperty('food', 'Food', 'names', { labelStrategy: 'localizedJson' }),
        foodId: fk(),
      },
      actions: { ...curatedActions, related: relatedAction(RelatedSections.foodVariant) },
    },
  };

  return [foodCategory, food, foodVariant];
}
