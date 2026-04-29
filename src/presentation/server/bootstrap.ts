import type { PrismaClient } from '@prisma/client';
import type { AdminJS } from 'adminjs';
import { loadEnv, type Env } from '@infrastructure/config/env';
import { getPrismaClient } from '@infrastructure/prisma/prisma-client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { RegisterUseCase } from '@application/auth/use-cases/register-use-case';
import { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { AuthController } from '@presentation/controllers/auth.controller';
import { HealthController } from '@presentation/controllers/health.controller';
import { createAdminJS } from '@infrastructure/admin/adminjs';

export interface Container {
  readonly env: Env;
  readonly prisma: PrismaClient;
  readonly admin: AdminJS;
  readonly tokens: JwtTokenSigner;
  readonly controllers: {
    readonly recipes: RecipesController;
    readonly auth: AuthController;
    readonly health: HealthController;
  };
}

// WHY: plain composition root — Node service has a single wiring point, no runtime DI needed.
export async function buildContainer(): Promise<Container> {
  const env = loadEnv();
  const prisma = getPrismaClient();

  const recipeRepo = new PrismaRecipeRepository(prisma);
  const authRepo = new PrismaAuthRepository(prisma);

  const hasher = new BcryptPasswordHasher(env.BCRYPT_ROUNDS);
  const tokens = new JwtTokenSigner({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });

  const listRecipes = new ListRecipesUseCase(recipeRepo);
  const getRecipe = new GetRecipeUseCase(recipeRepo);
  const createRecipe = new CreateRecipeUseCase(recipeRepo);
  const register = new RegisterUseCase(authRepo, hasher, tokens);
  const login = new LoginUseCase(authRepo, hasher, tokens);

  const admin = await createAdminJS(prisma, hasher);

  return {
    env,
    prisma,
    admin,
    tokens,
    controllers: {
      recipes: new RecipesController(listRecipes, getRecipe, createRecipe),
      auth: new AuthController(register, login),
      health: new HealthController(prisma),
    },
  };
}
