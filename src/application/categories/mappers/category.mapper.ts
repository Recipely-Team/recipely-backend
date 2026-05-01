import type { Category } from '@domain/categories/category';
import type { PageResult } from '@domain/recipes/recipe-query';
import type { CategoryDto, PagedCategoriesDto } from '@application/categories/dtos/category.dto';

export class CategoryMapper {
  static toDto(category: Category, locale: string): CategoryDto {
    const loc = category.localize(locale);
    return {
      id: category.id,
      slug: category.slug,
      name: loc.name,
      cuisine: loc.cuisine,
    };
  }

  static toPagedDto(page: PageResult<Category>, locale: string): PagedCategoriesDto {
    return {
      items: page.items.map(c => CategoryMapper.toDto(c, locale)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }
}