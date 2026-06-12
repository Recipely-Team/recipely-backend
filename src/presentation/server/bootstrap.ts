import type { PrismaClient } from '@prisma/client';
import type { AdminJS } from 'adminjs';
import path from 'path';
import { loadEnv, type Env } from '@infrastructure/config/env';
import { getPrismaClient } from '@infrastructure/prisma/prisma-client';
import { PrismaRecipeRepository } from '@infrastructure/repositories/recipes/prisma-recipe-repository';
import { PrismaAuthRepository } from '@infrastructure/repositories/auth/prisma-auth-repository';
import { PrismaFavoriteRepository } from '@infrastructure/repositories/favorites/prisma-favorite-repository';
import { PrismaRecipeLikeRepository } from '@infrastructure/repositories/likes/prisma-recipe-like-repository';
import { PrismaCommentLikeRepository } from '@infrastructure/repositories/likes/prisma-comment-like-repository';
import { PrismaAIGenerationLogRepository } from '@infrastructure/repositories/ai/prisma-ai-generation-log-repository';
import { PrismaCommentRepository } from '@infrastructure/repositories/comments/prisma-comment-repository';
import { PrismaNotificationRepository } from '@infrastructure/repositories/notifications/prisma-notification-repository';
import { PrismaFcmTokenRepository } from '@infrastructure/repositories/fcm/prisma-fcm-token-repository';
import { PrismaUserProfileRepository } from '@infrastructure/repositories/users/prisma-user-profile-repository';
import { PrismaUserFollowRepository } from '@infrastructure/repositories/users/prisma-user-follow-repository';
import { PrismaPasswordResetTokenRepository } from '@infrastructure/repositories/auth/prisma-password-reset-token-repository';
import { PrismaPendingRegistrationRepository } from '@infrastructure/repositories/auth/prisma-pending-registration-repository';
import { NodemailerEmailSender } from '@infrastructure/email/nodemailer-email-sender';
import { NoopEmailSender } from '@infrastructure/email/noop-email-sender';
import { PrismaRecipeDraftRepository } from '@infrastructure/repositories/drafts/prisma-recipe-draft-repository';
import { createRecipeGenerator } from '@infrastructure/ai/recipe-generator-factory';
import { createInstagramRecipeImporter } from '@infrastructure/ai/instagram-recipe-importer-factory';
import { createRecipeRefiner } from '@infrastructure/ai/recipe-refiner-factory';
import { createRecipeModerator } from '@infrastructure/ai/recipe-moderator-factory';
import { createCommentModerator } from '@infrastructure/ai/comment-moderator-factory';
import { createPromptModerator } from '@infrastructure/ai/prompt-moderator-factory';
import { createNutritionCalculator } from '@infrastructure/ai/nutrition-calculator-factory';
import { PinoLogger } from '@infrastructure/logger/pino-logger';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';
import { initFirebaseAdmin } from '@infrastructure/firebase/firebase-admin-client';
import { FcmPushNotifier } from '@infrastructure/firebase/fcm-push-notifier';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { UpdateRecipeUseCase } from '@application/recipes/use-cases/update-recipe-use-case';
import { DeleteRecipeUseCase } from '@application/recipes/use-cases/delete-recipe-use-case';
import { GenerateRecipeUseCase } from '@application/ai/use-cases/generate-recipe-use-case';
import { ImportInstagramRecipeUseCase } from '@application/ai/use-cases/import-instagram-recipe-use-case';
import { CalculateRecipeNutritionUseCase } from '@application/recipes/use-cases/calculate-recipe-nutrition-use-case';
import { BackfillRecipeNutritionUseCase } from '@application/recipes/use-cases/backfill-recipe-nutrition-use-case';
import { RequestRegistrationUseCase } from '@application/auth/use-cases/request-registration-use-case';
import { VerifyRegistrationUseCase } from '@application/auth/use-cases/verify-registration-use-case';
import { ResendRegistrationCodeUseCase } from '@application/auth/use-cases/resend-registration-code-use-case';
import { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';
import { ForgotPasswordUseCase } from '@application/auth/use-cases/forgot-password-use-case';
import { ResetPasswordUseCase } from '@application/auth/use-cases/reset-password-use-case';
import { FirebaseTokenVerifier } from '@infrastructure/firebase/firebase-token-verifier';
import { AddFavoriteUseCase } from '@application/favorites/use-cases/add-favorite-use-case';
import { RemoveFavoriteUseCase } from '@application/favorites/use-cases/remove-favorite-use-case';
import { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import { LikeRecipeUseCase } from '@application/likes/use-cases/like-recipe-use-case';
import { UnlikeRecipeUseCase } from '@application/likes/use-cases/unlike-recipe-use-case';
import { LikeCommentUseCase } from '@application/likes/use-cases/like-comment-use-case';
import { UnlikeCommentUseCase } from '@application/likes/use-cases/unlike-comment-use-case';
import { AddCommentUseCase } from '@application/comments/use-cases/add-comment-use-case';
import { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';
import { ListCommentsUseCase } from '@application/comments/use-cases/list-comments-use-case';
import { NotificationService } from '@application/notifications/notification-service';
import { RegisterFcmTokenUseCase } from '@application/notifications/use-cases/register-fcm-token-use-case';
import { ListNotificationsUseCase } from '@application/notifications/use-cases/list-notifications-use-case';
import { MarkNotificationsReadUseCase } from '@application/notifications/use-cases/mark-notifications-read-use-case';
import { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import { UpdateMyProfileUseCase } from '@application/users/use-cases/update-my-profile-use-case';
import { FollowUserUseCase } from '@application/users/use-cases/follow-user-use-case';
import { UnfollowUserUseCase } from '@application/users/use-cases/unfollow-user-use-case';
import { IncrementViewCountUseCase } from '@application/recipes/use-cases/increment-view-count-use-case';
import { UpsertDraftUseCase } from '@application/drafts/use-cases/upsert-draft-use-case';
import { GetDraftUseCase } from '@application/drafts/use-cases/get-draft-use-case';
import { ListDraftsUseCase } from '@application/drafts/use-cases/list-drafts-use-case';
import { GetLatestDraftUseCase } from '@application/drafts/use-cases/get-latest-draft-use-case';
import { DeleteDraftUseCase } from '@application/drafts/use-cases/delete-draft-use-case';
import { RefineRecipeUseCase } from '@application/ai/use-cases/refine-recipe-use-case';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { DraftsController } from '@presentation/controllers/drafts.controller';
import { AuthController } from '@presentation/controllers/auth.controller';
import { HealthController } from '@presentation/controllers/health.controller';
import { FavoritesController } from '@presentation/controllers/favorites.controller';
import { LikesController } from '@presentation/controllers/likes.controller';
import { MeController } from '@presentation/controllers/me.controller';
import { CommentsController } from '@presentation/controllers/comments.controller';
import { CommentLikesController } from '@presentation/controllers/comment-likes.controller';
import { NotificationsController } from '@presentation/controllers/notifications.controller';
import { UsersController } from '@presentation/controllers/users.controller';
import { UploadAvatarUseCase } from '@application/auth/use-cases/upload-avatar-use-case';
import { LocalAvatarUploader } from '@infrastructure/storage/local-avatar-uploader';
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
    readonly commentLikes: CommentLikesController;
    readonly notifications: NotificationsController;
    readonly users: UsersController;
    readonly drafts: DraftsController;
  };
}

// WHY: plain composition root — Node service has a single wiring point, no runtime DI needed.
export async function buildContainer(): Promise<Container> {
  const env = loadEnv();
  const prisma = getPrismaClient();

  // Initialise Firebase Admin SDK once at boot — needed for push notifications.
  initFirebaseAdmin(
    env.FIREBASE_PROJECT_ID,
    ...(env.FIREBASE_SERVICE_ACCOUNT_JSON !== undefined ? [env.FIREBASE_SERVICE_ACCOUNT_JSON] : []),
  );

  const recipeRepo = new PrismaRecipeRepository(prisma);
  const draftRepo = new PrismaRecipeDraftRepository(prisma);
  const authRepo = new PrismaAuthRepository(prisma);
  const favoriteRepo = new PrismaFavoriteRepository(prisma);
  const likeRepo = new PrismaRecipeLikeRepository(prisma);
  const commentLikeRepo = new PrismaCommentLikeRepository(prisma);
  const aiLogRepo = new PrismaAIGenerationLogRepository(prisma);
  const commentRepo = new PrismaCommentRepository(prisma);
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const fcmTokenRepo = new PrismaFcmTokenRepository(prisma);
  const userProfileRepo = new PrismaUserProfileRepository(prisma);
  const userFollowRepo = new PrismaUserFollowRepository(prisma);
  const passwordResetTokenRepo = new PrismaPasswordResetTokenRepository(prisma);
  const pendingRegistrationRepo = new PrismaPendingRegistrationRepository(prisma);

  const emailSender =
    env.SMTP_HOST !== undefined &&
    env.SMTP_PORT !== undefined &&
    env.SMTP_USER !== undefined &&
    env.SMTP_PASS !== undefined &&
    env.SMTP_FROM !== undefined
      ? new NodemailerEmailSender({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
          from: env.SMTP_FROM,
        })
      : new NoopEmailSender();

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

  const instagramRecipeImporter = createInstagramRecipeImporter({
    ...(env.GROQ_API_KEY !== undefined ? { groqApiKey: env.GROQ_API_KEY } : {}),
  });

  const recipeRefiner = createRecipeRefiner({
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    ...(env.GEMINI_API_KEY !== undefined ? { geminiApiKey: env.GEMINI_API_KEY } : {}),
    ...(env.ANTHROPIC_API_KEY !== undefined ? { anthropicApiKey: env.ANTHROPIC_API_KEY } : {}),
    ...(env.GROQ_API_KEY !== undefined ? { groqApiKey: env.GROQ_API_KEY } : {}),
  });

  const nutritionCalculator = createNutritionCalculator({
    model: env.AI_MODEL,
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

  const promptModerator = createPromptModerator({
    model: env.AI_MODEL,
    ...(env.GROQ_API_KEY !== undefined ? { apiKey: env.GROQ_API_KEY } : {}),
  });

  const fcmPushNotifier = new FcmPushNotifier(fcmTokenRepo);
  const notificationService = new NotificationService(notificationRepo, fcmPushNotifier);

  const listRecipes = new ListRecipesUseCase(recipeRepo);
  const getRecipe = new GetRecipeUseCase(recipeRepo);
  const createRecipe = new CreateRecipeUseCase(recipeRepo, recipeModerator, appLogger);
  const updateRecipe = new UpdateRecipeUseCase(recipeRepo, recipeModerator, appLogger);
  const deleteRecipe = new DeleteRecipeUseCase(recipeRepo);
  const generateRecipe = new GenerateRecipeUseCase(recipeGenerator, aiLogRepo, promptModerator, appLogger);
  const calculateNutrition = new CalculateRecipeNutritionUseCase(recipeRepo, nutritionCalculator, appLogger);
  const backfillNutrition = new BackfillRecipeNutritionUseCase(recipeRepo, authRepo, nutritionCalculator, appLogger);
  const requestRegistration = new RequestRegistrationUseCase(authRepo, pendingRegistrationRepo, hasher, emailSender, ts);
  const verifyRegistration = new VerifyRegistrationUseCase(authRepo, pendingRegistrationRepo, hasher, tokens);
  const resendRegistrationCode = new ResendRegistrationCodeUseCase(pendingRegistrationRepo, hasher, emailSender, ts);
  const login = new LoginUseCase(authRepo, hasher, tokens);
  const firebaseVerifier = new FirebaseTokenVerifier(env.FIREBASE_PROJECT_ID);
  const socialAuth = new SocialAuthUseCase(authRepo, tokens, firebaseVerifier);
  const addFavorite = new AddFavoriteUseCase(favoriteRepo, recipeRepo);
  const removeFavorite = new RemoveFavoriteUseCase(favoriteRepo);
  const listMyFavorites = new ListMyFavoritesUseCase(favoriteRepo);
  const likeRecipe = new LikeRecipeUseCase(likeRepo, recipeRepo, notificationService);
  const unlikeRecipe = new UnlikeRecipeUseCase(likeRepo);
  const likeComment = new LikeCommentUseCase(commentLikeRepo, commentRepo);
  const unlikeComment = new UnlikeCommentUseCase(commentLikeRepo);
  const addComment = new AddCommentUseCase(commentRepo, recipeRepo, commentModerator, appLogger, notificationService);
  const deleteComment = new DeleteCommentUseCase(commentRepo, recipeRepo);
  const listComments = new ListCommentsUseCase(commentRepo);

  const registerFcmToken = new RegisterFcmTokenUseCase(fcmTokenRepo);
  const listNotifications = new ListNotificationsUseCase(notificationRepo);
  const markNotificationsRead = new MarkNotificationsReadUseCase(notificationRepo);

  const getUserProfile = new GetUserProfileUseCase(userProfileRepo);
  const updateMyProfile = new UpdateMyProfileUseCase(authRepo);
  const followUser = new FollowUserUseCase(userFollowRepo, notificationService);
  const unfollowUser = new UnfollowUserUseCase(userFollowRepo);
  const incrementViewCount = new IncrementViewCountUseCase(recipeRepo);

  const upsertDraft = new UpsertDraftUseCase(draftRepo);
  const getDraft = new GetDraftUseCase(draftRepo);
  const listDrafts = new ListDraftsUseCase(draftRepo);
  const getLatestDraft = new GetLatestDraftUseCase(draftRepo);
  const deleteDraft = new DeleteDraftUseCase(draftRepo);
  const refineRecipe = new RefineRecipeUseCase(recipeRefiner);
  const importInstagramRecipe = new ImportInstagramRecipeUseCase(instagramRecipeImporter, aiLogRepo, appLogger);

  const appBaseUrl = env.APP_BASE_URL ?? env.BASE_URL ?? `http://localhost:${env.PORT}`;
  const forgotPassword = new ForgotPasswordUseCase(authRepo, passwordResetTokenRepo, emailSender, ts);
  const resetPassword = new ResetPasswordUseCase(authRepo, passwordResetTokenRepo, hasher);

  const admin = await createAdminJS(prisma, hasher);
  const aesKey = keyFromHex(env.API_AES_KEY);

  const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
  const avatarUploader = new LocalAvatarUploader(
    path.join(process.cwd(), 'public', 'uploads'),
    baseUrl,
  );
  const uploadAvatar = new UploadAvatarUseCase(authRepo, avatarUploader);

  return {
    env,
    prisma,
    admin,
    tokens,
    aesKey,
    ts,
    controllers: {
      recipes: new RecipesController(listRecipes, getRecipe, createRecipe, generateRecipe, ts, updateRecipe, deleteRecipe, calculateNutrition, backfillNutrition, incrementViewCount, importInstagramRecipe),
      auth: new AuthController(requestRegistration, verifyRegistration, resendRegistrationCode, login, socialAuth, ts, forgotPassword, resetPassword, appBaseUrl, env.NODE_ENV !== 'production'),
      health: new HealthController(prisma),
      favorites: new FavoritesController(addFavorite, removeFavorite, ts),
      likes: new LikesController(likeRecipe, unlikeRecipe, ts),
      me: new MeController(listRecipes, listMyFavorites, ts, uploadAvatar, updateMyProfile, getUserProfile),
      comments: new CommentsController(addComment, deleteComment, listComments, ts),
      commentLikes: new CommentLikesController(likeComment, unlikeComment, ts),
      notifications: new NotificationsController(registerFcmToken, listNotifications, markNotificationsRead, ts),
      users: new UsersController(getUserProfile, listRecipes, ts, followUser, unfollowUser),
      drafts: new DraftsController(upsertDraft, getDraft, listDrafts, getLatestDraft, deleteDraft, refineRecipe, ts),
    },
  };
}