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
 * A second review after the search was made choosier added fourteen more, and
 * they are the same four kinds: `karniyarik` came back as a table of clay pots,
 * `apple-pie` as a single croissant, `banh-mi` as a gloved hand at a counter,
 * `samosa` as two pastries held in a palm. The CC0 and public-domain pool
 * simply does not contain a good photograph of every dish, and the ranking that
 * now prefers a curated stock photograph over a diner's snapshot rescued six of
 * the twenty rather than all of them.
 *
 * They are kept here rather than deleted because the recipes are good and only
 * the picture is missing: when a better one turns up, removing a line from this
 * list publishes the dish. Publishing them now would rebuild the exact problem
 * the seed was meant to fix — a feed where a third of the cards are wrong.
 */
export const AWAITING_PHOTOGRAPH: ReadonlySet<string> = new Set([
  'apple-pie', 'baklava', 'banana-bread', 'banh-mi', 'biryani', 'borscht', 'bulgogi',
  'burrito', 'butter-chicken', 'caesar-salad', 'chili-con-carne', 'chow-mein', 'clam-chowder',
  'coleslaw', 'crepes', 'empanada', 'fish-and-chips', 'focaccia', 'fried-rice', 'gnocchi',
  'green-curry', 'guacamole', 'gyoza', 'hummus', 'imam-bayildi', 'karniyarik', 'kofte',
  'mashed-potatoes', 'meatballs-tomato', 'mercimek-corbasi', 'minestrone', 'omelette',
  'paella', 'panna-cotta', 'pilav', 'ramen', 'risotto', 'roast-chicken', 'samosa', 'scones',
  'souvlaki', 'spring-rolls', 'su-boregi', 'sutlac', 'tagine', 'tiramisu'
]);
