/**
 * The household portions a product can be logged in besides grams and
 * millilitres. Stable keys: the app words them in its own language, the
 * amounts come from the catalogue per variant. `pack` is also an Open Food
 * Facts product's package ("330 ml").
 */
export const ServingUnitKey = {
  Glass: 'glass',
  TeaGlass: 'teaGlass',
  Can: 'can',
  Bottle: 'bottle',
  Slice: 'slice',
  Piece: 'piece',
  Pack: 'pack',
  Tbsp: 'tbsp',
  Medium: 'medium',
} as const;

export type ServingUnitKeyType = (typeof ServingUnitKey)[keyof typeof ServingUnitKey];

export const isServingUnitKey = (v: unknown): v is ServingUnitKeyType =>
  (Object.values(ServingUnitKey) as unknown[]).includes(v);
