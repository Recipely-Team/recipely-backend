import { randomUUID } from 'crypto';
import { fail, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, type Failure } from '@core/failure';
import { DmRule } from '@domain/instagram/dm-rule';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { DmRuleDto } from '@application/instagram/dtos/dm-rule.dto';
import { instagramNotConfigured } from '@application/instagram/instagram-not-configured';
import { checkOwnRecipe } from '@application/instagram/rules/own-recipe-check';
import { ruleDto } from '@application/instagram/rules/rule-dto';

export interface CreateDmRuleInput {
  readonly userId: string;
  readonly locale: string;
  readonly mediaId: string;
  readonly keywords: readonly string[];
  readonly recipeId: string;
  readonly dmText: string;
  readonly publicReplyText: string | null;
  readonly enabled: boolean;
}

/**
 * **`POST /me/instagram/rules`** — a new comment-to-DM rule.
 *
 * @remarks
 * - Needs a usable Instagram connection (`errors.instagram.not_connected`).
 * - The post must be one of the connected account's
 *   (`errors.not_found.instagram_media`); its permalink, thumbnail and caption
 *   are snapshotted for the list.
 * - The recipe must be the user's own ({@link checkOwnRecipe}).
 */
export class CreateDmRuleUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly rules: DmRuleRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CreateDmRuleInput): Promise<Result<DmRuleDto, Failure>> {
    if (this.graph === null) return fail(instagramNotConfigured());
    const now = this.now();
    const connection = await this.connections.findByUserId(input.userId);
    if (!connection.ok) return connection;
    if (connection.value === null || !connection.value.isUsable(now)) return fail(new ConflictFailure('errors.instagram.not_connected'));

    const recipe = await checkOwnRecipe(this.recipes, input.recipeId, input.userId);
    if (!recipe.ok) return recipe;
    const media = await this.graph.findMedia(connection.value.accessToken, input.mediaId);
    if (!media.ok) return media;
    if (media.value === null) return fail(new NotFoundFailure('errors.not_found.instagram_media'));

    const rule = DmRule.create({
      id: randomUUID(),
      userId: input.userId,
      mediaId: media.value.id,
      media: { permalink: media.value.permalink, thumbnailUrl: media.value.thumbnailUrl, caption: media.value.caption },
      keywords: input.keywords,
      recipeId: input.recipeId,
      dmText: input.dmText,
      publicReplyText: input.publicReplyText,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    });
    if (!rule.ok) return rule;
    const saved = await this.rules.insert(rule.value);
    if (!saved.ok) return saved;
    return ruleDto(this.rules, rule.value.id, input.userId, input.locale);
  }
}
