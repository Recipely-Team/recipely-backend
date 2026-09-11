import type { PageResult } from '@domain/common/page-result';
import type { RecipeListItemDto } from '@application/recipes/dtos/recipe-list-item.dto';

export type PagedRecipeListDto = PageResult<RecipeListItemDto>;
