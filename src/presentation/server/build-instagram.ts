import type { PrismaClient } from '@prisma/client';
import type { Env } from '@infrastructure/config/env';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import { StartInstagramConnectUseCase } from '@application/instagram/connect/start-instagram-connect-use-case';
import { ReceiveInstagramAuthorizationUseCase } from '@application/instagram/connect/receive-instagram-authorization-use-case';
import { FinalizeInstagramConnectUseCase } from '@application/instagram/connect/finalize-instagram-connect-use-case';
import { RandomOneTimeCode } from '@infrastructure/instagram/random-one-time-code';
import { PrismaInstagramPendingLinkRepository } from '@infrastructure/repositories/instagram/prisma-instagram-pending-link-repository';
import { GetInstagramConnectionUseCase } from '@application/instagram/connect/get-instagram-connection-use-case';
import { DisconnectInstagramUseCase } from '@application/instagram/connect/disconnect-instagram-use-case';
import { RefreshInstagramTokensUseCase } from '@application/instagram/connect/refresh-instagram-tokens-use-case';
import { ListInstagramMediaUseCase } from '@application/instagram/connect/list-instagram-media-use-case';
import { CreateDmRuleUseCase } from '@application/instagram/rules/create-dm-rule-use-case';
import { UpdateDmRuleUseCase } from '@application/instagram/rules/update-dm-rule-use-case';
import { DeleteDmRuleUseCase } from '@application/instagram/rules/delete-dm-rule-use-case';
import { GetDmRuleUseCase } from '@application/instagram/rules/get-dm-rule-use-case';
import { ListDmRulesUseCase } from '@application/instagram/rules/list-dm-rules-use-case';
import { ListDmSendsUseCase } from '@application/instagram/rules/list-dm-sends-use-case';
import { ReceiveInstagramWebhookUseCase } from '@application/instagram/delivery/receive-instagram-webhook-use-case';
import { ProcessInstagramEventsUseCase } from '@application/instagram/delivery/process-instagram-events-use-case';
import { DeleteInstagramDataUseCase } from '@application/instagram/delivery/delete-instagram-data-use-case';
import { TtlCache } from '@infrastructure/cache/ttl-cache';
import { InstagramGraphClient } from '@infrastructure/instagram/instagram-graph-client';
import { InstagramTokenCipher } from '@infrastructure/instagram/instagram-token-cipher';
import { JwtConnectStateSigner } from '@infrastructure/instagram/jwt-connect-state-signer';
import { MetaSignatureVerifier } from '@infrastructure/instagram/meta-signature-verifier';
import { PrismaInstagramConnectionRepository } from '@infrastructure/repositories/instagram/prisma-instagram-connection-repository';
import { PrismaDmRuleRepository } from '@infrastructure/repositories/instagram/prisma-dm-rule-repository';
import { PrismaDmSendRepository } from '@infrastructure/repositories/instagram/prisma-dm-send-repository';
import { PrismaInstagramEventQueue } from '@infrastructure/repositories/instagram/prisma-instagram-event-queue';
import { InstagramController } from '@presentation/controllers/instagram/instagram.controller';
import { InstagramCallbackController } from '@presentation/controllers/instagram/instagram-callback.controller';
import { InstagramWebhookController } from '@presentation/controllers/instagram/instagram-webhook.controller';

/** Where a DM's recipe link points; the public web app, which opens for anyone. */
const RECIPE_LINK_BASE = 'https://recipely.net';
const MEDIA_CURSOR_TTL_MS = 30 * 60 * 1000;
const PRODUCTION_API_HOST = 'api.recipely.net';
const MEDIA_CURSOR_MAX = 2_000;

export interface InstagramWiring {
  readonly controller: InstagramController;
  readonly callback: InstagramCallbackController;
  readonly webhook: InstagramWebhookController;
  readonly connections: PrismaInstagramConnectionRepository;
  readonly processEvents: ProcessInstagramEventsUseCase;
  readonly refreshTokens: RefreshInstagramTokensUseCase;
}

/**
 * **The Instagram automations' composition** — kept beside `bootstrap.ts`
 * rather than in it, because it is a dozen use cases with one shared shape.
 * Without INSTAGRAM_APP_ID / _SECRET the graph client and the signature
 * verifier are `null`: the endpoints answer 503 and the jobs idle.
 */
export function buildInstagram(deps: {
  readonly env: Env;
  readonly prisma: PrismaClient;
  readonly recipes: RecipeRepositoryInterface;
  readonly creatorTags: CreatorTagRepositoryInterface;
  readonly logger: LoggerInterface;
  readonly ts: TranslationService;
}): InstagramWiring {
  const { env, prisma, recipes, creatorTags, logger, ts } = deps;
  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;
  const configured = appId !== undefined && appSecret !== undefined && redirectUri !== undefined;
  const graph = configured ? new InstagramGraphClient({ appId, appSecret, redirectUri }) : null;
  const verifier = appSecret !== undefined ? new MetaSignatureVerifier(appSecret) : null;

  const cipher = new InstagramTokenCipher(env.JWT_SECRET);
  const connections = new PrismaInstagramConnectionRepository(prisma, cipher);
  const pending = new PrismaInstagramPendingLinkRepository(prisma, cipher);
  const codes = new RandomOneTimeCode();
  const rules = new PrismaDmRuleRepository(prisma);
  const sends = new PrismaDmSendRepository(prisma);
  const queue = new PrismaInstagramEventQueue(prisma);
  const state = new JwtConnectStateSigner(env.JWT_SECRET);

  const controller = new InstagramController(
    {
      start: new StartInstagramConnectUseCase(graph, state, !isProductionApi(env.INSTAGRAM_REDIRECT_URI)),
      finalize: new FinalizeInstagramConnectUseCase(graph, pending, codes, connections, creatorTags, logger),
      getConnection: new GetInstagramConnectionUseCase(connections, configured),
      disconnect: new DisconnectInstagramUseCase(connections),
      listMedia: new ListInstagramMediaUseCase(graph, connections, new TtlCache<string | null>(MEDIA_CURSOR_TTL_MS, MEDIA_CURSOR_MAX)),
      createRule: new CreateDmRuleUseCase(graph, connections, rules, recipes),
      updateRule: new UpdateDmRuleUseCase(rules, recipes),
      deleteRule: new DeleteDmRuleUseCase(rules),
      getRule: new GetDmRuleUseCase(rules),
      listRules: new ListDmRulesUseCase(rules),
      listSends: new ListDmSendsUseCase(rules, sends),
    },
    ts,
  );
  return {
    controller,
    callback: new InstagramCallbackController(new ReceiveInstagramAuthorizationUseCase(graph, state, pending, codes, logger)),
    webhook: new InstagramWebhookController(
      { verifier, verifyToken: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? null },
      new ReceiveInstagramWebhookUseCase(queue),
      new DeleteInstagramDataUseCase(connections),
      logger,
    ),
    connections,
    processEvents: new ProcessInstagramEventsUseCase(queue, connections, rules, sends, recipes, graph, logger, RECIPE_LINK_BASE),
    refreshTokens: new RefreshInstagramTokensUseCase(graph, connections, logger),
  };
}

/**
 * Whether this server is production — read off the OAuth redirect URI's
 * host, because the dev box runs NODE_ENV=production too. Production never
 * accepts an http://localhost return link.
 */
function isProductionApi(redirectUri: string | undefined): boolean {
  if (redirectUri === undefined) return true;
  try {
    return new URL(redirectUri).hostname === PRODUCTION_API_HOST;
  } catch {
    return true;
  }
}
