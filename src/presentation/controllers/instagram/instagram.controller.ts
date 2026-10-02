import type { Request, Response } from 'express';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { TranslationService } from '@application/i18n/translation-service';
import type { StartInstagramConnectUseCase } from '@application/instagram/connect/start-instagram-connect-use-case';
import type { GetInstagramConnectionUseCase } from '@application/instagram/connect/get-instagram-connection-use-case';
import type { DisconnectInstagramUseCase } from '@application/instagram/connect/disconnect-instagram-use-case';
import type { ListInstagramMediaUseCase } from '@application/instagram/connect/list-instagram-media-use-case';
import type { CreateDmRuleUseCase } from '@application/instagram/rules/create-dm-rule-use-case';
import type { UpdateDmRuleUseCase } from '@application/instagram/rules/update-dm-rule-use-case';
import type { DeleteDmRuleUseCase } from '@application/instagram/rules/delete-dm-rule-use-case';
import type { GetDmRuleUseCase } from '@application/instagram/rules/get-dm-rule-use-case';
import type { ListDmRulesUseCase } from '@application/instagram/rules/list-dm-rules-use-case';
import type { ListDmSendsUseCase } from '@application/instagram/rules/list-dm-sends-use-case';
import {
  CreateDmRuleBodySchema,
  DmRuleIdParamSchema,
  InstagramStartQuerySchema,
  UpdateDmRuleBodySchema,
} from '@presentation/validators/instagram.validators';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { requireUser } from '@presentation/http/require-user';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface InstagramUseCases {
  readonly start: StartInstagramConnectUseCase;
  readonly getConnection: GetInstagramConnectionUseCase;
  readonly disconnect: DisconnectInstagramUseCase;
  readonly listMedia: ListInstagramMediaUseCase;
  readonly createRule: CreateDmRuleUseCase;
  readonly updateRule: UpdateDmRuleUseCase;
  readonly deleteRule: DeleteDmRuleUseCase;
  readonly getRule: GetDmRuleUseCase;
  readonly listRules: ListDmRulesUseCase;
  readonly listSends: ListDmSendsUseCase;
}

/** The signed-in creator's Instagram link, media and comment-to-DM rules (inside the API envelope). */
export class InstagramController {
  constructor(
    private readonly uc: InstagramUseCases,
    private readonly ts: TranslationService,
  ) {}

  start = async (req: Request, res: Response): Promise<void> => {
    const { returnTo } = InstagramStartQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.start.execute({ userId: requireUser(req).id, returnTo }), OK);
  };

  getConnection = async (req: Request, res: Response): Promise<void> => {
    this.reply(req, res, await this.uc.getConnection.execute(requireUser(req).id), OK);
  };

  disconnect = async (req: Request, res: Response): Promise<void> => {
    this.reply(req, res, await this.uc.disconnect.execute(requireUser(req).id), NO_CONTENT);
  };

  listMedia = async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.listMedia.execute({ userId: requireUser(req).id, page, pageSize }), OK);
  };

  listRules = async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.listRules.execute({ userId: requireUser(req).id, locale: locale(req), page, pageSize }), OK);
  };

  getRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = DmRuleIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.getRule.execute({ id, userId: requireUser(req).id, locale: locale(req) }), OK);
  };

  createRule = async (req: Request, res: Response): Promise<void> => {
    const body = CreateDmRuleBodySchema.parse(req.body);
    const result = await this.uc.createRule.execute({
      userId: requireUser(req).id,
      locale: locale(req),
      mediaId: body.mediaId,
      keywords: body.keywords,
      recipeId: body.recipeId,
      dmText: body.dmText,
      publicReplyText: body.publicReplyText ?? null,
      enabled: body.enabled,
    });
    this.reply(req, res, result, CREATED);
  };

  updateRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = DmRuleIdParamSchema.parse(req.params);
    const body = UpdateDmRuleBodySchema.parse(req.body);
    const result = await this.uc.updateRule.execute({
      id,
      userId: requireUser(req).id,
      locale: locale(req),
      ...(body.keywords !== undefined ? { keywords: body.keywords } : {}),
      ...(body.recipeId !== undefined ? { recipeId: body.recipeId } : {}),
      ...(body.dmText !== undefined ? { dmText: body.dmText } : {}),
      ...(body.publicReplyText !== undefined ? { publicReplyText: body.publicReplyText } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    this.reply(req, res, result, OK);
  };

  deleteRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = DmRuleIdParamSchema.parse(req.params);
    this.reply(req, res, await this.uc.deleteRule.execute({ id, userId: requireUser(req).id }), NO_CONTENT);
  };

  listSends = async (req: Request, res: Response): Promise<void> => {
    const { id } = DmRuleIdParamSchema.parse(req.params);
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    this.reply(req, res, await this.uc.listSends.execute({ ruleId: id, userId: requireUser(req).id, page, pageSize }), OK);
  };

  private reply<T>(req: Request, res: Response, result: Result<T, Failure>, status: number): void {
    if (!result.ok) {
      const { status: failed, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale(req)), locale(req));
      res.status(failed).json(body);
      return;
    }
    if (status === NO_CONTENT) {
      res.status(status).send();
      return;
    }
    res.status(status).json(result.value);
  }
}

const locale = (req: Request): string => req.locale ?? 'en';
