import type { PrismaClient } from '@prisma/client';
import type { AdminJS } from 'adminjs';
import { loadEnv, type Env } from '@infrastructure/config/env';
import { getPrismaClient } from '@infrastructure/prisma/prisma-client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { PrismaFavoriteRepository } from '@infrastructure/repositories/favorites/prisma-favorite-repository';
import { PrismaRecipeLikeRepository } from '@infrastructure/repositories/likes/prisma-recipe-like-repository';
import { PrismaAIGenerationLogRepository } from '@infrastructure/repositories/ai/prisma-ai-generation-log-repository';
import { PrismaCommentRepository } from '@infrastructure/repositories/comments/prisma-comment-repository';
import { createRecipeGenerator } from '@infrastructure/ai/recipe-generator-factory';
import { createRecipeModerator } from '@infrastructure/ai/recipe-moderator-factory';
import { createCommentModerator } from '@infrastructure/ai/comment-moderator-factory';
import { PinoLogger } from '@infrastructure/logger/pino-logger';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { UpdateRecipeUseCase } from '@application/recipes/use-cases/update-recipe-use-case';
import { DeleteRecipeUseCase } from '@application/recipes/use-cases/delete-recipe-use-case';
import { GenerateRecipeUseCase } from '@application/ai/use-cases/generate-recipe-use-case';
import { RegisterUseCase } from '@application/auth/use-cases/register-use-case';
import { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import { AddFavoriteUseCase } from '@application/favorites/use-cases/add-favorite-use-case';
import { RemoveFavoriteUseCase } from '@application/favorites/use-cases/remove-favorite-use-case';
import { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import { LikeRecipeUseCase } from '@application/likes/use-cases/like-recipe-use-case';
import { UnlikeRecipeUseCase } from '@application/likes/use-cases/unlike-recipe-use-case';
import { AddCommentUseCase } from '@application/comments/use-cases/add-comment-use-case';
import { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';
import { ListCommentsUseCase } from '@application/comments/use-cases/list-comments-use-case';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { AuthController } from '@presentation/controllers/auth.controller';
import { HealthController } from '@presentation/controllers/health.controller';
import { FavoritesController } from '@presentation/controllers/favorites.controller';
import { LikesController } from '@presentation/controllers/likes.controller';
import { MeController } from '@presentation/controllers/me.controller';
import { CommentsController } from '@presentation/controllers/comments.controller';
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
    readonly likes: LikesController;
    readonly me: MeController;
    readonly comments: CommentsController;
  };
}

// WHY: plain composition root — Node service has a single wiring point, no runtime DI needed.
export async function buildContainer(): Promise<Container> {
  const env = loadEnv();
  const prisma = getPrismaClient();

  const recipeRepo = new PrismaRecipeRepository(prisma);
  const authRepo = new PrismaAuthRepository(prisma);
  const favoriteRepo = new PrismaFavoriteRepository(prisma);
  const likeRepo = new PrismaRecipeLikeRepository(prisma);
  const aiLogRepo = new PrismaAIGenerationLogRepository(prisma);
  const commentRepo = new PrismaCommentRepository(prisma);

  const hasher = new BcryptPasswordHasher(env.BCRYPT_ROUNDS);
  const tokens = new JwtTokenSigner({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });

  const ts = new I18nextTranslationService();
  await ts.init();

  const appLogger = new PinoLogger();

  const recipeGenerator = createRecipeGenerator({
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    ...(env.GEMINI_API_KEY !== undefined ? { geminiApiKey: env.GEMINI_API_KEY } : {}),
    ...(env.ANTHROPIC_API_KEY !== undefined ? { anthropicApiKey: env.ANTHROPIC_API_KEY } : {}),
    ...(env.GROQ_API_KEY !== undefined ? { groqApiKey: env.GROQ_API_KEY } : {}),
  });

  const recipeModerator = createRecipeModerator({
    model: env.AI_MODEL,
    ...(env.GROQ_API_KEY !== undefined ? { apiKey: env.GROQ_API_KEY } : {}),
  });

  const commentModerator = createCommentModerator({
    model: env.AI_MODEL,
    ...(env.GROQ_API_KEY !== undefined ? { apiKey: env.GROQ_API_KEY } : {}),
  });

  const listRecipes = new ListRecipesUseCase(recipeRepo);
  const getRecipe = new GetRecipeUseCase(recipeRepo);
  const createRecipe = new CreateRecipeUseCase(recipeRepo, recipeModerator, appLogger);
  const updateRecipe = new UpdateRecipeUseCase(recipeRepo, recipeModerator, appLogger);
  const deleteRecipe = new DeleteRecipeUseCase(recipeRepo);
  const generateRecipe = new GenerateRecipeUseCase(recipeGenerator, recipeRepo, aiLogRepo, recipeModerator, appLogger);
  const register = new RegisterUseCase(authRepo, hasher, tokens);
  const login = new LoginUseCase(authRepo, hasher, tokens);
  const addFavorite = new AddFavoriteUseCase(favoriteRepo, recipeRepo);
  const removeFavorite = new RemoveFavoriteUseCase(favoriteRepo);
  const listMyFavorites = new ListMyFavoritesUseCase(favoriteRepo);
  const likeRecipe = new LikeRecipeUseCase(likeRepo, recipeRepo);
  const unlikeRecipe = new UnlikeRecipeUseCase(likeRepo);
  const addComment = new AddCommentUseCase(commentRepo, recipeRepo, commentModerator, appLogger);
  const deleteComment = new DeleteCommentUseCase(commentRepo, recipeRepo);
  const listComments = new ListCommentsUseCase(commentRepo);

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
      recipes: new RecipesController(listRecipes, getRecipe, createRecipe, generateRecipe, ts, updateRecipe, deleteRecipe),
      auth: new AuthController(register, login, ts),
      health: new HealthController(prisma),
      favorites: new FavoritesController(addFavorite, removeFavorite, ts),
      likes: new LikesController(likeRecipe, unlikeRecipe, ts),
      me: new MeController(listRecipes, listMyFavorites, ts),
      comments: new CommentsController(addComment, deleteComment, listComments, ts),
    },
  };
}