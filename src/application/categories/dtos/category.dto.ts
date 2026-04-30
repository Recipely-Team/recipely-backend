export interface CategoryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly cuisine: string;
}

export interface PagedCategoriesDto {
  readonly items: CategoryDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}