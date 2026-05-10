import type { PrismaClient } from '@prisma/client';
import type { AdminJS } from 'adminjs';
import { loadEnv, type Env } from '@infrastructure/config/env';
import { getPrismaClient } from '@infrastructure/prisma/prisma-client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { PrismaFavoriteRepository } from '@infrastructure/repositories/favorites/prisma-favorite-repository';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { RegisterUseCase } from '@application/auth/use-cases/register-use-case';
import { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import { AddFavoriteUseCase } from '@application/favorites/use-cases/add-favorite-use-case';
import { RemoveFavoriteUseCase } from '@application/favorites/use-cases/remove-favorite-use-case';
import { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { AuthController } from '@presentation/controllers/auth.controller';
import { HealthController } from '@presentation/controllers/health.controller';
import { FavoritesController } from '@presentation/controllers/favorites.controller';
import { MeController } from '@presentation/controllers/me.controller';
import { createAdminJS } from '@infrastructure/admin/adminjs';
import { keyFromHex } from '@infrastructure/crypto/aes-envelope';
import type { TranslationService } from '@application/i18n/translation-service';

export interface Container {
  readonly env: Env;
  readonly prisma: PrismaClient;
  readonly admin: AdminJS;
  readonly tokens: JwtTokenSigner;
  readonly aesKey: Buffer;
  readonly ts: TranslationService;
  readonly controllers: {
    readonly recipes: RecipesController;
    readonly auth: AuthController;
    readonly health: HealthController;
    readonly favorites: FavoritesController;
    readonly me: MeController;
  };
}

// WHY: plain composition root — Node service has a single wiring point, no runtime DI needed.
export async function buildContainer(): Promise<Container> {
  const env = loadEnv();
  const prisma = getPrismaClient();

  const recipeRepo = new PrismaRecipeRepository(prisma);
  const authRepo = new PrismaAuthRepository(prisma);
  const favoriteRepo = new PrismaFavoriteRepository(prisma);

  const hasher = new BcryptPasswordHasher(env.BCRYPT_ROUNDS);
  const tokens = new JwtTokenSigner({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });

  const ts = new I18nextTranslationService();
  await ts.init();

  const listRecipes = new ListRecipesUseCase(recipeRepo);
  const getRecipe = new GetRecipeUseCase(recipeRepo);
  const createRecipe = new CreateRecipeUseCase(recipeRepo);
  const register = new RegisterUseCase(authRepo, hasher, tokens);
  const login = new LoginUseCase(authRepo, hasher, tokens);
  const addFavorite = new AddFavoriteUseCase(favoriteRepo, recipeRepo);
  const removeFavorite = new RemoveFavoriteUseCase(favoriteRepo);
  const listMyFavorites = new ListMyFavoritesUseCase(favoriteRepo);

  const admin = await createAdminJS(prisma, hasher);
  const aesKey = keyFromHex(env.API_AES_KEY);

  return {
    env,
    prisma,
    admin,
    tokens,
    aesKey,
    ts,
    controllers: {
      recipes: new RecipesController(listRecipes, getRecipe, createRecipe, ts),
      auth: new AuthController(register, login, ts),
      health: new HealthController(prisma),
      favorites: new FavoritesController(addFavorite, removeFavorite, ts),
      me: new MeController(listRecipes, listMyFavorites, ts),
    },
  };
}