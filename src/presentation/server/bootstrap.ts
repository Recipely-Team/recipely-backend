import { createKeyPool } from '@infrastructure/ai/keys/create-key-pool';
import { TieredKeyPool } from '@infrastructure/ai/keys/tiered-key-pool';
import { mergeApiKeys } from '@infrastructure/ai/keys/parse-api-keys';
import type { PrismaClient } from '@prisma/client';
import type { AdminJS } from 'adminjs';
import path from 'path';
import { loadEnv, type Env } from '@infrastructure/config/env';
import { resolveFixedRegistrationCode } from '@infrastructure/config/fixed-registration-code';
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
import { PrismaDeviceRepository } from '@infrastructure/repositories/devices/prisma-device-repository';
import { PrismaUserProfileRepository } from '@infrastructure/repositories/users/prisma-user-profile-repository';
import { PrismaCreatorTagRepository } from '@infrastructure/repositories/users/prisma-creator-tag-repository';
import { PrismaUserFollowRepository } from '@infrastructure/repositories/users/prisma-user-follow-repository';
import { PrismaPasswordResetTokenRepository } from '@infrastructure/repositories/auth/prisma-password-reset-token-repository';
import { PrismaPendingRegistrationRepository } from '@infrastructure/repositories/auth/prisma-pending-registration-repository';
import { NodemailerEmailSender } from '@infrastructure/email/nodemailer-email-sender';
import { NoopEmailSender } from '@infrastructure/email/noop-email-sender';
import { PrismaRecipeDraftRepository } from '@infrastructure/repositories/drafts/prisma-recipe-draft-repository';
import { PrismaImportJobRepository } from '@infrastructure/repositories/imports/prisma-import-job-repository';
import { PrismaAssistantUsageRepository } from '@infrastructure/repositories/assistant/prisma-assistant-usage-repository';
import { PrismaFeedbackRepository } from '@infrastructure/repositories/feedback/prisma-feedback-repository';
import { PrismaFeatureFlagRepository } from '@infrastructure/repositories/flags/prisma-feature-flag-repository';
import { createRecipeGenerator } from '@infrastructure/ai/recipe-generator-factory';
import { createInstagramRecipeImporter } from '@infrastructure/ai/instagram-recipe-importer-factory';
import { createRecipeRefiner } from '@infrastructure/ai/recipe-refiner-factory';
import { createRecipeModerator } from '@infrastructure/ai/recipe-moderator-factory';
import { createCommentModerator } from '@infrastructure/ai/comment-moderator-factory';
import { createPromptModerator } from '@infrastructure/ai/prompt-moderator-factory';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import { createNutritionCalculator } from '@infrastructure/ai/nutrition-calculator-factory';
import { PinoLogger } from '@infrastructure/logger/pino-logger';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { JwtAssistantIntentTokenSigner } from '@infrastructure/security/jwt-assistant-intent-token-signer';
import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';
import { initFirebaseAdmin } from '@infrastructure/firebase/firebase-admin-client';
import { FcmPushNotifier } from '@infrastructure/firebase/fcm-push-notifier';
import { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import { GetRecipeUseCase } from '@application/recipes/use-cases/get-recipe-use-case';
import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { DeleteRecipeUseCase } from '@application/recipes/use-cases/delete-recipe-use-case';
import { GenerateRecipeUseCase } from '@application/ai/use-cases/generate-recipe-use-case';
import { ImportInstagramRecipeUseCase } from '@application/ai/use-cases/import-instagram-recipe-use-case';
import { CalculateRecipeNutritionUseCase } from '@application/recipes/use-cases/calculate-recipe-nutrition-use-case';
import { BackfillRecipeNutritionUseCase } from '@application/recipes/use-cases/backfill-recipe-nutrition-use-case';
import { SweepRecipeNutritionUseCase } from '@application/recipes/use-cases/sweep-recipe-nutrition-use-case';
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
import { ListMyLikedRecipesUseCase } from '@application/likes/use-cases/list-my-liked-recipes-use-case';
import { ListMyDevicesUseCase } from '@application/devices/use-cases/list-my-devices-use-case';
import { RecordMyDeviceUseCase } from '@application/devices/use-cases/record-my-device-use-case';
import { LikeCommentUseCase } from '@application/likes/use-cases/like-comment-use-case';
import { UnlikeCommentUseCase } from '@application/likes/use-cases/unlike-comment-use-case';
import { AddCommentUseCase } from '@application/comments/use-cases/add-comment-use-case';
import { DeleteCommentUseCase } from '@application/comments/use-cases/delete-comment-use-case';
import { ListCommentsUseCase } from '@application/comments/use-cases/list-comments-use-case';
import { ModerateCommentUseCase } from '@application/comments/use-cases/moderate-comment-use-case';
import { ModerateRecipeUseCase } from '@application/recipes/use-cases/moderate-recipe-use-case';
import { SuspendUserUseCase } from '@application/auth/use-cases/suspend-user-use-case';
import { UnsuspendUserUseCase } from '@application/auth/use-cases/unsuspend-user-use-case';
import { NotificationService } from '@application/notifications/notification-service';
import { RegisterFcmTokenUseCase } from '@application/notifications/use-cases/register-fcm-token-use-case';
import { ListNotificationsUseCase } from '@application/notifications/use-cases/list-notifications-use-case';
import { MarkNotificationsReadUseCase } from '@application/notifications/use-cases/mark-notifications-read-use-case';
import { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import { UpdateMyProfileUseCase } from '@application/users/use-cases/update-my-profile-use-case';
import { GetMyProfileUseCase } from '@application/users/use-cases/get-my-profile-use-case';
import { RequestCreatorTagUseCase } from '@application/users/use-cases/request-creator-tag-use-case';
import { RemoveCreatorTagUseCase } from '@application/users/use-cases/remove-creator-tag-use-case';
import { ReviewCreatorTagUseCase } from '@application/users/use-cases/review-creator-tag-use-case';
import { ListCreatorsUseCase } from '@application/users/use-cases/list-creators-use-case';
import { DeleteAccountUseCase } from '@application/auth/use-cases/delete-account-use-case';
import { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { FollowUserUseCase } from '@application/users/use-cases/follow-user-use-case';
import { UnfollowUserUseCase } from '@application/users/use-cases/unfollow-user-use-case';
import { IncrementViewCountUseCase } from '@application/recipes/use-cases/increment-view-count-use-case';
import { ListTrendingRecipesUseCase } from '@application/recipes/use-cases/list-trending-recipes-use-case';
import { UpsertDraftUseCase } from '@application/drafts/use-cases/upsert-draft-use-case';
import { GetDraftUseCase } from '@application/drafts/use-cases/get-draft-use-case';
import { ListDraftsUseCase } from '@application/drafts/use-cases/list-drafts-use-case';
import { GetLatestDraftUseCase } from '@application/drafts/use-cases/get-latest-draft-use-case';
import { DeleteDraftUseCase } from '@application/drafts/use-cases/delete-draft-use-case';
import { RefineRecipeUseCase } from '@application/ai/use-cases/refine-recipe-use-case';
import { GeminiLiveSessionMinter } from '@infrastructure/assistant/gemini-live-session-minter';
import { AnswerAssistantMessageUseCase } from '@application/assistant/use-cases/answer-assistant-message-use-case';
import { createAssistantResponder } from '@infrastructure/assistant/assistant-responder-factory';
import { MintAssistantSessionUseCase } from '@application/assistant/use-cases/mint-assistant-session-use-case';
import { RecordAssistantUsageUseCase } from '@application/assistant/use-cases/record-assistant-usage-use-case';
import { MintAssistantIntentTokenUseCase } from '@application/assistant/use-cases/mint-assistant-intent-token-use-case';
import { SubmitFeedbackUseCase } from '@application/feedback/use-cases/submit-feedback-use-case';
import { GetFeatureFlagOverridesUseCase } from '@application/flags/use-cases/get-feature-flag-overrides-use-case';
import { RecipesController } from '@presentation/controllers/recipes.controller';
import { DraftsController } from '@presentation/controllers/drafts.controller';
import { ImportFileRecipeUseCase } from '@application/imports/use-cases/import-file-recipe-use-case';
import { createFileRecipeReader } from '@infrastructure/ai/file-recipe-reader-factory';
import { ImportJobsController } from '@presentation/controllers/import-jobs.controller';
import { RecipePublicationController } from '@presentation/controllers/recipe-publication.controller';
import { PublishRecipeUseCase } from '@application/recipes/publishing/publish-recipe-use-case';
import { UnpublishRecipeUseCase } from '@application/recipes/publishing/unpublish-recipe-use-case';
import { EnqueueImportUseCase } from '@application/imports/use-cases/enqueue-import-use-case';
import { GetImportJobUseCase } from '@application/imports/use-cases/get-import-job-use-case';
import { ClaimImportJobUseCase } from '@application/imports/use-cases/claim-import-job-use-case';
import { CompleteImportJobUseCase } from '@application/imports/use-cases/complete-import-job-use-case';
import { FailImportJobUseCase } from '@application/imports/use-cases/fail-import-job-use-case';
import { ReapAbandonedImportJobsUseCase } from '@application/imports/use-cases/reap-abandoned-import-jobs-use-case';
import { AssistantController } from '@presentation/controllers/assistant.controller';
import { FeedbackController } from '@presentation/controllers/feedback.controller';
import { FlagsController } from '@presentation/controllers/flags.controller';
import { AuthController } from '@presentation/controllers/auth.controller';
import { HealthController } from '@presentation/controllers/health.controller';
import { FavoritesController } from '@presentation/controllers/favorites.controller';
import { PrismaFoodDiaryRepository } from '@infrastructure/repositories/diary/prisma-food-diary-repository';
import { GetDiaryDayUseCase } from '@application/diary/use-cases/get-diary-day-use-case';
import { GetDiaryMonthUseCase } from '@application/diary/use-cases/get-diary-month-use-case';
import { ListRecentFoodsUseCase } from '@application/diary/use-cases/list-recent-foods-use-case';
import { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { UpdateFoodLogEntryUseCase } from '@application/diary/use-cases/update-food-log-entry-use-case';
import { DeleteFoodLogEntryUseCase } from '@application/diary/use-cases/delete-food-log-entry-use-case';
import { SetDayWaterUseCase } from '@application/diary/use-cases/set-day-water-use-case';
import { GetNutritionGoalsUseCase } from '@application/diary/use-cases/get-nutrition-goals-use-case';
import { SetNutritionGoalsUseCase } from '@application/diary/use-cases/set-nutrition-goals-use-case';
import { DiaryController } from '@presentation/controllers/diary.controller';
import { PrismaShoppingListRepository } from '@infrastructure/repositories/shopping/prisma-shopping-list-repository';
import { ListShoppingItemsUseCase } from '@application/shopping/use-cases/list-shopping-items-use-case';
import { AddShoppingItemsUseCase } from '@application/shopping/use-cases/add-shopping-items-use-case';
import { UpdateShoppingItemUseCase } from '@application/shopping/use-cases/update-shopping-item-use-case';
import { DeleteShoppingItemUseCase } from '@application/shopping/use-cases/delete-shopping-item-use-case';
import { ClearShoppingListUseCase } from '@application/shopping/use-cases/clear-shopping-list-use-case';
import { ShoppingListController } from '@presentation/controllers/shopping/shopping-list.controller';
import type { InstagramController } from '@presentation/controllers/instagram/instagram.controller';
import type { InstagramCallbackController } from '@presentation/controllers/instagram/instagram-callback.controller';
import type { InstagramWebhookController } from '@presentation/controllers/instagram/instagram-webhook.controller';
import type { ProcessInstagramEventsUseCase } from '@application/instagram/delivery/process-instagram-events-use-case';
import type { RefreshInstagramTokensUseCase } from '@application/instagram/connect/refresh-instagram-tokens-use-case';
import type { PollInstagramCommentsUseCase } from '@application/instagram/delivery/poll-instagram-comments-use-case';
import { buildInstagram } from '@presentation/server/build-instagram';
import { SearchDiaryFoodsUseCase } from '@application/diary/use-cases/search-diary-foods-use-case';
import { PrismaDiaryRecipeSearch } from '@infrastructure/repositories/diary/prisma-diary-recipe-search';
import { PrismaFoodCatalogRepository } from '@infrastructure/repositories/foods/prisma-food-catalog-repository';
import { OpenFoodFactsSearch } from '@infrastructure/foods/open-food-facts-search';
import { ListRecentFoodsPageUseCase } from '@application/diary/use-cases/list-recent-foods-page-use-case';
import { ListFoodProductsUseCase } from '@application/foods/use-cases/list-food-products-use-case';
import { GetFoodProductUseCase } from '@application/foods/use-cases/get-food-product-use-case';
import { GetBrandedProductUseCase } from '@application/foods/use-cases/get-branded-product-use-case';
import { ListFoodCategoriesUseCase } from '@application/foods/use-cases/list-food-categories-use-case';
import { LikesController } from '@presentation/controllers/likes.controller';
import { MeController } from '@presentation/controllers/me.controller';
import { CommentsController } from '@presentation/controllers/comments/comments.controller';
import { CommentLikesController } from '@presentation/controllers/comments/comment-likes.controller';
import { NotificationsController } from '@presentation/controllers/notifications.controller';
import { UsersController } from '@presentation/controllers/users.controller';
import { UploadAvatarUseCase } from '@application/auth/use-cases/upload-avatar-use-case';
import { LocalAvatarUploader } from '@infrastructure/storage/local-avatar-uploader';
import { LocalRecipePhotoStore } from '@infrastructure/storage/local-recipe-photo-store';
import { createImageModerator } from '@infrastructure/ai/image-moderator-factory';
import { createPhotoFocusDetector } from '@infrastructure/ai/photo-focus/photo-focus-detector-factory';
import { PrismaPhotoFocusRepository } from '@infrastructure/repositories/recipes/prisma-photo-focus-repository';
import { SweepPhotoFocusUseCase } from '@application/recipes/photos/sweep-photo-focus-use-case';
import { AddRecipePhotoUseCase } from '@application/recipes/photos/add-recipe-photo-use-case';
import { RemoveRecipePhotoUseCase } from '@application/recipes/photos/remove-recipe-photo-use-case';
import { RemoveRecipeCoverUseCase } from '@application/recipes/photos/remove-recipe-cover-use-case';
import { EditRecipeUseCase } from '@application/recipes/editing/edit-recipe-use-case';
import { LocalImportCoverStore } from '@infrastructure/storage/local-import-cover-store';
import { PruneImportCoversUseCase } from '@application/ai/use-cases/prune-import-covers-use-case';
import { createAdminJS } from '@infrastructure/admin/adminjs';
import { keyFromHex } from '@infrastructure/crypto/aes-envelope';
import type { TranslationService } from '@application/i18n/translation-service';

export interface Container {
  readonly env: Env;
  readonly prisma: PrismaClient;
  readonly admin: AdminJS;
  readonly tokens: JwtTokenSigner;
  readonly intentTokens: JwtAssistantIntentTokenSigner;
  /** Auth middlewares run this per request so a deleted account's live JWT stops working. */
  readonly ensureAccountActive: EnsureAccountActiveUseCase;
  readonly aesKey: Buffer;
  readonly ts: TranslationService;
  /** Swept on a timer from the server entrypoint — nothing else deletes orphaned import covers. */
  readonly pruneImportCovers: PruneImportCoversUseCase;
  /** Path fragment every stored import cover URL contains; scopes the prune to our own files. */
  readonly importCoverMarker: string;
  /**
   * Swept on a timer from the server entrypoint. Without it a job that uses up
   * its attempts stops being claimable but never finishes, so the user's screen
   * says "importing" forever and nothing ever tells them otherwise.
   */
  readonly reapAbandonedImportJobs: ReapAbandonedImportJobsUseCase;
  /**
   * Swept on a timer from the server entrypoint. Nothing has ever calculated
   * nutrition: creating a recipe stores whatever the payload carried, and the
   * only two ways to get a figure were an admin endpoint nobody called and a
   * per-recipe endpoint the app does not know about — so most published
   * recipes said "no nutrition information yet" and always would have.
   */
  readonly sweepNutrition: SweepRecipeNutritionUseCase;
  readonly processInstagramEvents: ProcessInstagramEventsUseCase;
  readonly refreshInstagramTokens: RefreshInstagramTokensUseCase;
  readonly pollInstagramComments: PollInstagramCommentsUseCase | null;
  /**
   * Swept on a timer from the server entrypoint: finds where the dish sits in
   * each photo so clients crop onto the food. `null` when no vision provider
   * holds a key — see `createPhotoFocusDetector`.
   */
  readonly sweepPhotoFocus: SweepPhotoFocusUseCase | null;
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
    readonly assistant: AssistantController;
    readonly feedback: FeedbackController;
    readonly flags: FlagsController;
    readonly importJobs: ImportJobsController;
    readonly recipePublication: RecipePublicationController;
    readonly diary: DiaryController;
    readonly shoppingList: ShoppingListController;
    readonly instagram: InstagramController;
    readonly instagramCallback: InstagramCallbackController;
    readonly instagramWebhook: InstagramWebhookController;
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
  const diaryRepo = new PrismaFoodDiaryRepository(prisma);
  const shoppingRepo = new PrismaShoppingListRepository(prisma);
  const foodCatalog = new PrismaFoodCatalogRepository(prisma);
  const openFoodFacts = new OpenFoodFactsSearch(env.OFF_CONTACT_EMAIL);
  const likeRepo = new PrismaRecipeLikeRepository(prisma);
  const commentLikeRepo = new PrismaCommentLikeRepository(prisma);
  const aiLogRepo = new PrismaAIGenerationLogRepository(prisma);
  const commentRepo = new PrismaCommentRepository(prisma);
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const fcmTokenRepo = new PrismaFcmTokenRepository(prisma);
  const deviceRepo = new PrismaDeviceRepository(prisma);
  const userProfileRepo = new PrismaUserProfileRepository(prisma);
  const creatorTagRepo = new PrismaCreatorTagRepository(prisma);
  const userFollowRepo = new PrismaUserFollowRepository(prisma);
  const passwordResetTokenRepo = new PrismaPasswordResetTokenRepository(prisma);
  const pendingRegistrationRepo = new PrismaPendingRegistrationRepository(prisma);
  const feedbackRepo = new PrismaFeedbackRepository(prisma);
  const featureFlagRepo = new PrismaFeatureFlagRepository(prisma);
  const assistantUsageRepo = new PrismaAssistantUsageRepository(prisma);

  const appLogger = new PinoLogger();

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
      : new NoopEmailSender(appLogger);

  const hasher = new BcryptPasswordHasher(env.BCRYPT_ROUNDS);
  const tokens = new JwtTokenSigner({ secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });
  // Same secret, a different claim: what has to be impossible is a token from one
  // door opening the other, and both verifiers check the claim for that.
  const intentTokens = new JwtAssistantIntentTokenSigner({
    secret: env.JWT_SECRET,
    lifetimeSeconds: env.ASSISTANT_INTENT_TOKEN_TTL_SEC,
  });
  const mintAssistantIntentToken = new MintAssistantIntentTokenUseCase(intentTokens);

  const ts = new I18nextTranslationService();
  await ts.init();

  // Pools, not the singular vars: the Gemini key deployed to production lives
  // in GEMINI_API_KEYS, so a chain built from GEMINI_API_KEY would never have
  // put Gemini in it. Same construction the import pipeline uses.
  const recipeGenerator = createRecipeGenerator({
    geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
    groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
    geminiModel: env.GEMINI_MODEL_NAME,
    groqModel: env.GROQ_MODEL_NAME,
  });

  const instagramRecipeImporter = createInstagramRecipeImporter({
    groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
    geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
  });

  // The same pools and the same order as the generator above: a recipe written
  // by Gemini was being refined by Groq, because this seat alone still obeyed
  // AI_PROVIDER and that defaults to groq.
  const recipeRefiner = createRecipeRefiner({
    geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
    groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
    geminiModel: env.GEMINI_MODEL_NAME,
    groqModel: env.GROQ_MODEL_NAME,
  });

  const nutritionCalculator = createNutritionCalculator({
    model: env.GROQ_MODEL_NAME,
    ...(env.GROQ_API_KEY !== undefined ? { groqApiKey: env.GROQ_API_KEY } : {}),
  });

  const recipeModerator = createRecipeModerator({
    model: env.GROQ_MODEL_NAME,
    ...(env.GROQ_API_KEY !== undefined ? { apiKey: env.GROQ_API_KEY } : {}),
  });

  const commentModerator = createCommentModerator({
    model: env.GROQ_MODEL_NAME,
    ...(env.GROQ_API_KEY !== undefined ? { apiKey: env.GROQ_API_KEY } : {}),
  });

  const promptModerator = createPromptModerator({
    model: env.GROQ_MODEL_NAME,
    ...(env.GROQ_API_KEY !== undefined ? { apiKey: env.GROQ_API_KEY } : {}),
  });

  const fcmPushNotifier = new FcmPushNotifier(fcmTokenRepo);
  const notificationService = new NotificationService(notificationRepo, fcmPushNotifier);

  // Deterministic word-list filter — shared across every use case that
  // accepts free-text user input. Runs before the Groq semantic moderators.
  const contentModerator = new WordListContentModerator();

  const listRecipes = new ListRecipesUseCase(recipeRepo);
  const getRecipe = new GetRecipeUseCase(recipeRepo);
  const createRecipe = new CreateRecipeUseCase(recipeRepo, recipeModerator, appLogger, contentModerator, draftRepo, notificationRepo, aiLogRepo);
  const publishRecipe = new PublishRecipeUseCase(recipeRepo, recipeModerator, appLogger);
  const unpublishRecipe = new UnpublishRecipeUseCase(recipeRepo);
  const deleteRecipe = new DeleteRecipeUseCase(recipeRepo);
  const generateRecipe = new GenerateRecipeUseCase(recipeGenerator, aiLogRepo, promptModerator, appLogger, contentModerator);
  const calculateNutrition = new CalculateRecipeNutritionUseCase(recipeRepo, nutritionCalculator, appLogger);
  // The sweep does the work; the backfill is the admin door onto it and the
  // scheduler in `index.ts` is the other caller.
  const sweepNutrition = new SweepRecipeNutritionUseCase(recipeRepo, nutritionCalculator, appLogger);
  const backfillNutrition = new BackfillRecipeNutritionUseCase(authRepo, sweepNutrition, appLogger);
  const fixedRegistrationCode = resolveFixedRegistrationCode(env);
  const requestRegistration = new RequestRegistrationUseCase(authRepo, pendingRegistrationRepo, hasher, emailSender, ts, contentModerator, fixedRegistrationCode);
  const verifyRegistration = new VerifyRegistrationUseCase(authRepo, pendingRegistrationRepo, hasher, tokens, deviceRepo);
  const resendRegistrationCode = new ResendRegistrationCodeUseCase(pendingRegistrationRepo, hasher, emailSender, ts, fixedRegistrationCode);
  const login = new LoginUseCase(authRepo, hasher, tokens, deviceRepo);
  const firebaseVerifier = new FirebaseTokenVerifier(env.FIREBASE_PROJECT_ID);
  const socialAuth = new SocialAuthUseCase(authRepo, tokens, firebaseVerifier, deviceRepo);
  const addFavorite = new AddFavoriteUseCase(favoriteRepo, recipeRepo);
  const removeFavorite = new RemoveFavoriteUseCase(favoriteRepo);
  const listMyFavorites = new ListMyFavoritesUseCase(favoriteRepo);
  const likeRecipe = new LikeRecipeUseCase(likeRepo, recipeRepo, notificationService);
  const unlikeRecipe = new UnlikeRecipeUseCase(likeRepo);
  const listMyLikedRecipes = new ListMyLikedRecipesUseCase(likeRepo);
  const listMyDevices = new ListMyDevicesUseCase(deviceRepo);
  const recordMyDevice = new RecordMyDeviceUseCase(deviceRepo);
  const likeComment = new LikeCommentUseCase(commentLikeRepo, commentRepo);
  const unlikeComment = new UnlikeCommentUseCase(commentLikeRepo);
  const addComment = new AddCommentUseCase(commentRepo, recipeRepo, commentModerator, appLogger, notificationService, authRepo, contentModerator);
  const deleteComment = new DeleteCommentUseCase(commentRepo, recipeRepo, notificationRepo, appLogger);
  const listComments = new ListCommentsUseCase(commentRepo);
  const moderateRecipe = new ModerateRecipeUseCase(recipeRepo, notificationService);
  const moderateComment = new ModerateCommentUseCase(commentRepo, notificationService);

  const registerFcmToken = new RegisterFcmTokenUseCase(fcmTokenRepo);
  const listNotifications = new ListNotificationsUseCase(notificationRepo);
  const markNotificationsRead = new MarkNotificationsReadUseCase(notificationRepo);

  const getUserProfile = new GetUserProfileUseCase(userProfileRepo);
  const updateMyProfile = new UpdateMyProfileUseCase(authRepo, contentModerator);
  const getMyProfile = new GetMyProfileUseCase(userProfileRepo);
  const requestCreatorTag = new RequestCreatorTagUseCase(creatorTagRepo, contentModerator);
  const removeCreatorTag = new RemoveCreatorTagUseCase(creatorTagRepo);
  const reviewCreatorTag = new ReviewCreatorTagUseCase(creatorTagRepo, notificationService);
  const listCreators = new ListCreatorsUseCase(userProfileRepo);
  const instagram = buildInstagram({ env, prisma, recipes: recipeRepo, creatorTags: creatorTagRepo, logger: appLogger, ts, contentModerator });
  const deleteAccount = new DeleteAccountUseCase(authRepo, diaryRepo, instagram.connections);
  const ensureAccountActive = new EnsureAccountActiveUseCase(authRepo);
  const suspendUser = new SuspendUserUseCase(authRepo);
  const unsuspendUser = new UnsuspendUserUseCase(authRepo);
  const followUser = new FollowUserUseCase(userFollowRepo, authRepo, notificationService);
  const unfollowUser = new UnfollowUserUseCase(userFollowRepo);
  const incrementViewCount = new IncrementViewCountUseCase(recipeRepo);
  const listTrendingRecipes = new ListTrendingRecipesUseCase(recipeRepo);

  const upsertDraft = new UpsertDraftUseCase(draftRepo);
  const getDraft = new GetDraftUseCase(draftRepo);
  const listDrafts = new ListDraftsUseCase(draftRepo);
  const getLatestDraft = new GetLatestDraftUseCase(draftRepo);
  const deleteDraft = new DeleteDraftUseCase(draftRepo);
  const refineRecipe = new RefineRecipeUseCase(recipeRefiner, contentModerator, appLogger, ts);
  const submitFeedback = new SubmitFeedbackUseCase(feedbackRepo, contentModerator);
  const getFeatureFlagOverrides = new GetFeatureFlagOverridesUseCase(featureFlagRepo);
  // Voice reuses the Gemini key pool: Live sessions are rate-limited per key
  // like every other call, so a second key is a second allowance of concurrent
  // sessions — the only lever there is on the free tier.
  const liveSessionMinter = new GeminiLiveSessionMinter({
    // The legacy singular/plural vars fold into FREE: every key on every box
    // already deployed is a free one, and an operator adding paid keys must not
    // have to move the old ones first.
    keys: new TieredKeyPool(
      mergeApiKeys(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
      mergeApiKeys(env.GEMINI_API_KEYS_PAID),
    ),
    model: env.ASSISTANT_LIVE_MODEL,
  });
  // Both take the auth repository so the role can be read per request: an
  // admin is unmetered, and reading it from the row rather than the JWT means
  // the grant takes effect on the next call instead of the next sign-in.
  const mintAssistantSession = new MintAssistantSessionUseCase(
    assistantUsageRepo,
    liveSessionMinter,
    {
      userDailySeconds: env.ASSISTANT_DAILY_SECONDS,
      globalDailySeconds: env.ASSISTANT_GLOBAL_DAILY_SECONDS,
    },
    authRepo,
  );
  const recordAssistantUsage = new RecordAssistantUsageUseCase(
    assistantUsageRepo,
    env.ASSISTANT_DAILY_SECONDS,
    authRepo,
  );
  // The typed turn runs on a TEXT model: the Live models only speak, and the
  // whole point of this mode is being affordable when voice is not.
  //
  // Two seats, for the reason generation and photo moderation have two: a
  // Gemini capacity spike used to take the typed assistant down for everyone,
  // and this is the mode that exists to work when voice cannot.
  const answerAssistantMessage = new AnswerAssistantMessageUseCase(
    createAssistantResponder({
      geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
      groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
      geminiModel: env.ASSISTANT_TEXT_MODEL,
      groqModel: env.GROQ_MODEL_NAME,
    }),
  );

  const appBaseUrl = env.APP_BASE_URL ?? env.BASE_URL ?? `http://localhost:${env.PORT}`;
  const forgotPassword = new ForgotPasswordUseCase(authRepo, passwordResetTokenRepo, emailSender, ts);
  const resetPassword = new ResetPasswordUseCase(authRepo, passwordResetTokenRepo, hasher);

  const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
  const admin = await createAdminJS(
    prisma,
    hasher,
    env.ADMIN_ROOT_PATH,
    baseUrl,
    deleteComment,
    moderateRecipe,
    moderateComment,
    suspendUser,
    unsuspendUser,
    reviewCreatorTag,
  );
  const aesKey = keyFromHex(env.API_AES_KEY);

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const avatarUploader = new LocalAvatarUploader(uploadsDir, baseUrl);
  const uploadAvatar = new UploadAvatarUseCase(authRepo, avatarUploader);

  const importCoverStore = new LocalImportCoverStore(uploadsDir, baseUrl);
  const recipePhotoStore = new LocalRecipePhotoStore(uploadsDir, baseUrl);
  // Vision, not text: the photo a user adds after publishing is the one thing
  // on this platform nobody reads before it goes out.
  const imageModerator = createImageModerator({
    geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
    groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
  });
  const addRecipePhoto = new AddRecipePhotoUseCase(recipeRepo, recipePhotoStore, imageModerator);
  const photoFocusDetector = createPhotoFocusDetector({
    geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
    groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
    uploadsDir,
    baseUrl,
  });
  const sweepPhotoFocus =
    photoFocusDetector !== null
      ? new SweepPhotoFocusUseCase(new PrismaPhotoFocusRepository(prisma), photoFocusDetector, appLogger)
      : null;
  const removeRecipePhoto = new RemoveRecipePhotoUseCase(recipeRepo);
  const removeRecipeCover = new RemoveRecipeCoverUseCase(recipeRepo);
  const editRecipe = new EditRecipeUseCase(recipeRepo, contentModerator);
  const importInstagramRecipe = new ImportInstagramRecipeUseCase(
    instagramRecipeImporter,
    aiLogRepo,
    appLogger,
    importCoverStore,
  );
  const pruneImportCovers = new PruneImportCoversUseCase(recipeRepo, importCoverStore, appLogger);
  const importCoverMarker = '/uploads/imports/';

  const importJobRepo = new PrismaImportJobRepository(prisma);
  const enqueueImport = new EnqueueImportUseCase(importJobRepo, env.IMPORT_MAX_IN_FLIGHT_PER_USER);
  const importFileRecipe = new ImportFileRecipeUseCase(
    createFileRecipeReader({
      groqKeys: createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS),
      geminiKeys: createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE),
    }),
    draftRepo,
  );
  const getImportJob = new GetImportJobUseCase(importJobRepo);
  const claimImportJob = new ClaimImportJobUseCase(importJobRepo, env.IMPORT_LEASE_MS, env.IMPORT_MAX_ATTEMPTS);
  const completeImportJob = new CompleteImportJobUseCase(
    importJobRepo,
    draftRepo,
    importCoverStore,
    notificationService,
    ts,
    appLogger,
  );
  const failImportJob = new FailImportJobUseCase(importJobRepo, notificationService, ts, appLogger);
  const reapAbandonedImportJobs = new ReapAbandonedImportJobsUseCase(
    importJobRepo,
    notificationService,
    ts,
    appLogger,
    env.IMPORT_LEASE_MS,
    env.IMPORT_MAX_ATTEMPTS,
  );

  return {
    env,
    prisma,
    admin,
    tokens,
    intentTokens,
    ensureAccountActive,
    aesKey,
    ts,
    pruneImportCovers,
    importCoverMarker,
    reapAbandonedImportJobs,
    sweepNutrition,
    processInstagramEvents: instagram.processEvents,
    refreshInstagramTokens: instagram.refreshTokens,
    pollInstagramComments: instagram.pollComments,
    sweepPhotoFocus,
    controllers: {
      recipes: new RecipesController(listRecipes, getRecipe, createRecipe, generateRecipe, ts, deleteRecipe, calculateNutrition, backfillNutrition, incrementViewCount, importInstagramRecipe, listTrendingRecipes, addRecipePhoto, removeRecipePhoto, removeRecipeCover),
      auth: new AuthController(requestRegistration, verifyRegistration, resendRegistrationCode, login, socialAuth, ts, forgotPassword, resetPassword, appBaseUrl, env.NODE_ENV !== 'production', env.PROXY_DEPTH),
      health: new HealthController(prisma),
      favorites: new FavoritesController(addFavorite, removeFavorite, ts),
      diary: new DiaryController(
        {
          getDay: new GetDiaryDayUseCase(diaryRepo),
          getMonth: new GetDiaryMonthUseCase(diaryRepo),
          listRecent: new ListRecentFoodsUseCase(diaryRepo),
          addEntry: new AddFoodLogEntryUseCase(diaryRepo, recipeRepo, foodCatalog),
          updateEntry: new UpdateFoodLogEntryUseCase(diaryRepo),
          deleteEntry: new DeleteFoodLogEntryUseCase(diaryRepo),
          setWater: new SetDayWaterUseCase(diaryRepo),
          getGoals: new GetNutritionGoalsUseCase(diaryRepo),
          setGoals: new SetNutritionGoalsUseCase(diaryRepo),
          searchFoods: new SearchDiaryFoodsUseCase(new PrismaDiaryRecipeSearch(prisma), foodCatalog, openFoodFacts, appLogger),
          listRecentPage: new ListRecentFoodsPageUseCase(diaryRepo),
          listProducts: new ListFoodProductsUseCase(foodCatalog),
          getProduct: new GetFoodProductUseCase(foodCatalog),
          getBrandedProduct: new GetBrandedProductUseCase(openFoodFacts),
          listCategories: new ListFoodCategoriesUseCase(foodCatalog),
        },
        ts,
      ),
      shoppingList: new ShoppingListController(
        {
          list: new ListShoppingItemsUseCase(shoppingRepo),
          add: new AddShoppingItemsUseCase(shoppingRepo, contentModerator),
          update: new UpdateShoppingItemUseCase(shoppingRepo, contentModerator),
          remove: new DeleteShoppingItemUseCase(shoppingRepo),
          clear: new ClearShoppingListUseCase(shoppingRepo),
        },
        ts,
      ),
      likes: new LikesController(likeRecipe, unlikeRecipe, ts),
      me: new MeController(listRecipes, listMyFavorites, ts, uploadAvatar, updateMyProfile, getMyProfile, deleteAccount, listMyLikedRecipes, listMyDevices, recordMyDevice, requestCreatorTag, removeCreatorTag, env.PROXY_DEPTH),
      comments: new CommentsController(addComment, deleteComment, listComments, ts),
      commentLikes: new CommentLikesController(likeComment, unlikeComment, ts),
      notifications: new NotificationsController(registerFcmToken, listNotifications, markNotificationsRead, ts),
      users: new UsersController(getUserProfile, listRecipes, ts, followUser, unfollowUser, listCreators),
      drafts: new DraftsController(upsertDraft, getDraft, listDrafts, getLatestDraft, deleteDraft, refineRecipe, ts),
      assistant: new AssistantController(
        mintAssistantSession,
        recordAssistantUsage,
        answerAssistantMessage,
        ts,
        mintAssistantIntentToken,
      ),
      feedback: new FeedbackController(submitFeedback, ts),
      flags: new FlagsController(getFeatureFlagOverrides, ts),
      importJobs: new ImportJobsController(enqueueImport, getImportJob, claimImportJob, completeImportJob, failImportJob, ts, importFileRecipe),
      recipePublication: new RecipePublicationController(publishRecipe, unpublishRecipe, ts, editRecipe),
      instagram: instagram.controller,
      instagramCallback: instagram.callback,
      instagramWebhook: instagram.webhook,
    },
  };
}