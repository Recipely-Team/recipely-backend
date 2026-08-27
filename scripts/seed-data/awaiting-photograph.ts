/**
 * Dishes whose recipe is written but whose photograph is not good enough yet.
 *
 * @remarks
 * Every image in the seed was looked at, not merely matched. These are the ones
 * that failed on sight, in four kinds:
 *
 * - **Not the dish.** `focaccia` returned a pizza, `gnocchi` a salmon fillet,
 *   `omelette` what appears to be pizza slices.
 * - **Not a photograph.** `coleslaw`, `guacamole` and `ramen` returned clipart.
 *   A drawing on a recipe card reads as a placeholder, which is the thing this
 *   whole exercise exists to remove.
 * - **Not of the food.** `souvlaki` was a skewer on a pavement, `empanada` a
 *   street scene, `fish-and-chips` a shop sign, `hummus` a market shelf.
 * - **Unappetising.** `baklava` in a takeaway box, `imam-bayildi` pale in a
 *   bowl, `sutlac` a white dish at a distance. Correct, and nobody would cook
 *   from them.
 *
 * They are kept here rather than deleted because the recipes are good and only
 * the picture is missing: when a better one turns up, removing a line from this
 * list publishes the dish. Publishing them now would rebuild the exact problem
 * the seed was meant to fix — a feed where a third of the cards are wrong.
 */
export const AWAITING_PHOTOGRAPH: ReadonlySet<string> = new Set([
  'baklava', 'banana-bread', 'borscht', 'burrito', 'caesar-salad', 'chili-con-carne',
  'chow-mein', 'clam-chowder', 'coleslaw', 'crepes', 'empanada', 'fish-and-chips',
  'focaccia', 'fried-rice', 'gnocchi', 'green-curry', 'guacamole', 'gyoza', 'hummus',
  'imam-bayildi', 'kofte', 'mashed-potatoes', 'mercimek-corbasi', 'minestrone',
  'omelette', 'panna-cotta', 'ramen', 'roast-chicken', 'souvlaki', 'su-boregi',
  'sutlac', 'tiramisu', 'tortilla-espanola',
]);
