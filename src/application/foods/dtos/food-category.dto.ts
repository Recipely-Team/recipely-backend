/** One shelf of the Products tab. */
export interface FoodCategoryDto {
  readonly key: string;
  readonly name: string;
  /** How many foods it holds. */
  readonly productCount: number;
}
