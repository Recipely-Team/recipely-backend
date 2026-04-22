import type { PrismaClient } from '@prisma/client';
import { loadEnv, type Env } from '@infrastructure/config/env';
import { getPrismaClient } from '@infrastructure/prisma/prisma-client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { PrismaFeatureFlagRepository } from '@infrastructure/repositories/feature-flags/prisma-feature-flag-repository';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { RegisterUseCase } from '@application/auth/use-cases/register-use-case';
import { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import { ListFeatureFlagsUseCase } from '@application/feature-flags/use-cases/list-feature-flags-use-case';
import { UpdateFeatureFlagUseCase } from '@application/feature-flags/use-cases/update-feature-flag-use-case';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { AuthController } from '@presentation/controllers/auth.controller';
import { HealthController } from '@presentation/controllers/health.controller';
import { AdminController } from '@presentation/controllers/admin.controller';

export interface Container {
  readonly env: Env;
  readonly prisma: PrismaClient;
  readonly controllers: {
    readonly recipes: RecipesController;
    readonly auth: AuthController;
    readonly health: HealthController;
    readonly admin: AdminController;
  };
}

// WHY: plain composition root — Node service has a single wiring point, no runtime DI needed.
export function buildContainer(): Container {
  const env = loadEnv();
  const prisma = getPrismaClient();

  const recipeRepo = new PrismaRecipeRepository(prisma);
  const authRepo = new PrismaAuthRepository(prisma);
  const featureFlagRepo = new PrismaFeatureFlagRepository(prisma);

  const hasher = new BcryptPasswordHasher(env.BCRYPT_ROUNDS);
  const tokens = new JwtTokenSigner({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });

  const listRecipes = new ListRecipesUseCase(recipeRepo);
  const getRecipe = new GetRecipeUseCase(recipeRepo);
  const register = new RegisterUseCase(authRepo, hasher, tokens);
  const login = new LoginUseCase(authRepo, hasher, tokens);
  const listFeatureFlags = new ListFeatureFlagsUseCase(featureFlagRepo);
  const updateFeatureFlag = new UpdateFeatureFlagUseCase(featureFlagRepo);

  return {
    env,
    prisma,
    controllers: {
      recipes: new RecipesController(listRecipes, getRecipe),
      auth: new AuthController(register, login),
      health: new HealthController(prisma),
      admin: new AdminController(listFeatureFlags, updateFeatureFlag, prisma),
    },
  };
}
