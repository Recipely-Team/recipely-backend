/**
 * What both vision providers are asked about a recipe photo.
 *
 * @remarks
 * - **The dish, not the frame's busiest part.** Reel frames are full of hands,
 *   pans, jars and faces; the point exists so a crop lands on the food.
 * - **A tiny reply shape.** Two numbers and nothing else — the parser rejects
 *   anything wider, so a chatty answer is a failed detection, not a guess.
 */
export const PHOTO_FOCUS_PROMPT = [
  'You are shown ONE photo attached to a recipe.',
  'Find the centre of the main finished dish or plated food in it.',
  'If there is no plated dish, use the food that is the clear subject; ignore hands, faces, utensils, packaging and text.',
  'Answer with JSON only, exactly this shape: {"x": <number>, "y": <number>}',
  'x is the horizontal position as a fraction of the image width (0 = left edge, 1 = right edge).',
  'y is the vertical position as a fraction of the image height (0 = top edge, 1 = bottom edge).',
].join('\n');
