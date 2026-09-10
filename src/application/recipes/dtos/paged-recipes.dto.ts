import type { PageResult } from '@domain/common/page-result';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

export type PagedRecipesDto = PageResult<RecipeDto>;
