export const CuisineKey = {
  Turkish: 'TURKISH',
  Italian: 'ITALIAN',
  Mexican: 'MEXICAN',
  Chinese: 'CHINESE',
  Japanese: 'JAPANESE',
  Indian: 'INDIAN',
  French: 'FRENCH',
  Greek: 'GREEK',
  American: 'AMERICAN',
  Mediterranean: 'MEDITERRANEAN',
  Thai: 'THAI',
  Spanish: 'SPANISH',
  Korean: 'KOREAN',
  MiddleEastern: 'MIDDLE_EASTERN',
  Other: 'OTHER',
} as const;

export type CuisineKey = (typeof CuisineKey)[keyof typeof CuisineKey];

export const isCuisineKey = (v: unknown): v is CuisineKey =>
  v === CuisineKey.Turkish ||
  v === CuisineKey.Italian ||
  v === CuisineKey.Mexican ||
  v === CuisineKey.Chinese ||
  v === CuisineKey.Japanese ||
  v === CuisineKey.Indian ||
  v === CuisineKey.French ||
  v === CuisineKey.Greek ||
  v === CuisineKey.American ||
  v === CuisineKey.Mediterranean ||
  v === CuisineKey.Thai ||
  v === CuisineKey.Spanish ||
  v === CuisineKey.Korean ||
  v === CuisineKey.MiddleEastern ||
  v === CuisineKey.Other;

export const CUISINE_KEY_VALUES: readonly CuisineKey[] = [
  CuisineKey.Turkish,
  CuisineKey.Italian,
  CuisineKey.Mexican,
  CuisineKey.Chinese,
  CuisineKey.Japanese,
  CuisineKey.Indian,
  CuisineKey.French,
  CuisineKey.Greek,
  CuisineKey.American,
  CuisineKey.Mediterranean,
  CuisineKey.Thai,
  CuisineKey.Spanish,
  CuisineKey.Korean,
  CuisineKey.MiddleEastern,
  CuisineKey.Other,
];
