/** A catalogue shelf with its name per locale and how many products it holds. */
export interface FoodCategoryData {
  readonly key: string;
  readonly names: Readonly<Record<string, string>>;
  readonly productCount: number;
}
