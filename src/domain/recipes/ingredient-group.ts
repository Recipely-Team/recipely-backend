/**
 * A recipe made of separate components — a dessert's syrup, a cake's filling —
 * names its parts with heading lines inside the ordinary `ingredients` array,
 * marked by a leading `#` the way Markdown marks one.
 *
 * Chosen over a nested shape because it needs no migration and no change to
 * the wire DTO, the draft snapshot or the AI response schema: a client that
 * knows nothing about groups still shows every ingredient. The cost is that
 * anything COUNTING or MEASURING ingredients has to skip the headings, which
 * is what this predicate is for — nutrition is the load-bearing case, since a
 * heading has no quantity to estimate from.
 */
export const isIngredientGroupHeading = (line: string): boolean => line.trimStart().startsWith('#');
