import { z } from 'zod';
import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import { isStatsRange, type StatsRangeType } from '@application/instagram/stats/stats-range';

// Every refusal carries a catalogue key, a wrong TYPE included.
const keyed = (key: string) => ({ invalid_type_error: key, required_error: key });

/** `GET /auth/instagram/start` — where the app wants the callback to land (checked against an allowlist). */
export const InstagramStartQuerySchema = z.object({
  returnTo: z.string(keyed('errors.validation.instagram_return_invalid')).max(500, 'errors.validation.instagram_return_invalid'),
});

/** `GET /auth/instagram/callback` — Instagram's redirect; every field may be missing. */
export const InstagramCallbackQuerySchema = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(4000).optional(),
  error: z.string().max(200).optional(),
});

/** `POST /me/instagram/finalize` — the one-time code from the callback's return link. */
export const FinalizeInstagramBodySchema = z.object({
  code: z.string(keyed('errors.instagram.link_invalid')).min(16, 'errors.instagram.link_invalid').max(200, 'errors.instagram.link_invalid'),
});

export const DmRuleIdParamSchema = z.object({ id: z.string().uuid('errors.not_found.dm_rule') });

const keywords = z
  .array(z.string(keyed('errors.validation.dm_rule_keywords_invalid')).max(DmRuleLimits.KeywordMaxLength, 'errors.validation.dm_rule_keywords_invalid'), keyed('errors.validation.dm_rule_keywords_invalid'))
  .min(1, 'errors.validation.dm_rule_keywords_invalid')
  .max(DmRuleLimits.KeywordsMax, 'errors.validation.dm_rule_keywords_invalid');
const dmText = z.string(keyed('errors.validation.dm_rule_text_invalid')).max(DmRuleLimits.DmTextMaxLength, 'errors.validation.dm_rule_text_invalid');
const publicReplyText = z
  .string(keyed('errors.validation.dm_rule_reply_invalid'))
  .max(DmRuleLimits.PublicReplyMaxLength, 'errors.validation.dm_rule_reply_invalid')
  .nullable();
const recipeId = z.string(keyed('errors.not_found.recipe')).uuid('errors.not_found.recipe');

export const CreateDmRuleBodySchema = z.object({
  mediaId: z.string(keyed('errors.validation.dm_rule_media_required')).min(1, 'errors.validation.dm_rule_media_required').max(64),
  keywords,
  recipeId,
  dmText,
  publicReplyText: publicReplyText.optional(),
  enabled: z.boolean().default(true),
});

export const UpdateDmRuleBodySchema = z
  .object({ keywords: keywords.optional(), recipeId: recipeId.optional(), dmText: dmText.optional(), publicReplyText: publicReplyText.optional(), enabled: z.boolean().optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), { message: 'errors.validation.nothing_to_edit' });

/** `GET /me/instagram/stats?days=7|30|90`. */
export const CreatorStatsQuerySchema = z.object({
  days: z.coerce
    .number(keyed('errors.validation.invalid_request'))
    .refine((days): days is StatsRangeType => isStatsRange(days), 'errors.validation.invalid_request'),
});

/** `/instagram/dm-sends/:id/open` and `/me/instagram/dm-sends/:id/save`. */
export const DmSendIdParamSchema = z.object({ id: z.string().uuid('errors.validation.invalid_request') });

/** `POST /me/instagram/dm-sends/:id/save` — the recipe that was saved. */
export const RecordDmSaveBodySchema = z.object({ recipeId });
