import { DmSendStatus } from '@domain/instagram/dm-send-status';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import { InstagramEventStatus } from '@domain/instagram/instagram-event-status';
import type { ModelLookup } from '@infrastructure/admin/resources/model-lookup';
import {
  enumValues,
  fk,
  immutableActions,
  readOnlyActions,
  recipeRef,
  refProperty,
  userRef,
} from '@infrastructure/admin/resources/resource-helpers';
import { RelatedSections, relatedAction } from '@infrastructure/admin/resources/related-sections';

// Connect-with-Instagram and comment-to-DM. Everything here is driven by the
// webhook/poller pipeline, so nothing is hand-editable. `accessTokenEnc` and
// `codeHash` are credentials: hidden here AND stripped from every response
// (SENSITIVE_FIELDS in strip-params-hook.ts).
export function buildInstagramResources({ prisma, modelByName }: ModelLookup) {
  const navigation = { name: 'Instagram', icon: 'Instagram' };
  const hidden = { isVisible: false };
  const status = (values: Record<string, string>) => ({
    availableValues: enumValues(Object.values(values)),
    components: { list: 'EnumLabel', show: 'EnumLabel' },
  });

  const connection = {
    resource: { model: modelByName('InstagramConnection'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'connectedAt', direction: 'desc' as const },
      listProperties: ['user', 'username', 'status', 'tokenExpiresAt', 'connectedAt'],
      filterProperties: ['userId', 'username', 'igUserId', 'status'],
      properties: {
        ...userRef('user'),
        userId: fk(),
        accessTokenEnc: hidden,
        status: status(InstagramConnectionStatus),
      },
      actions: { ...immutableActions },
    },
  };

  const pendingLink = {
    resource: { model: modelByName('InstagramPendingLink'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'username', 'expiresAt', 'createdAt'],
      filterProperties: ['userId', 'username', 'expiresAt'],
      properties: { ...userRef('user'), userId: fk(), accessTokenEnc: hidden, codeHash: hidden },
      actions: { ...readOnlyActions },
    },
  };

  const dmRule = {
    resource: { model: modelByName('DmRule'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['user', 'mediaCaption', 'keywords', 'recipe', 'enabled', 'createdAt'],
      filterProperties: ['userId', 'recipeId', 'mediaId', 'enabled', 'createdAt'],
      properties: { ...userRef('user'), ...recipeRef(), userId: fk(), recipeId: fk() },
      actions: { ...readOnlyActions, related: relatedAction(RelatedSections.dmRule) },
    },
  };

  const dmSend = {
    resource: { model: modelByName('DmSend'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['rule', 'commenterUsername', 'commentText', 'status', 'reason', 'createdAt'],
      filterProperties: ['ruleId', 'userId', 'status', 'reason', 'createdAt'],
      properties: {
        ...refProperty('rule', 'DmRule', 'mediaCaption', { maxLength: 40 }),
        ruleId: fk(),
        status: status(DmSendStatus),
      },
      actions: { ...immutableActions },
    },
  };

  const event = {
    resource: { model: modelByName('InstagramEvent'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'createdAt', direction: 'desc' as const },
      listProperties: ['field', 'igUserId', 'status', 'attempts', 'eventTime', 'processedAt'],
      filterProperties: ['igUserId', 'field', 'status', 'createdAt'],
      properties: { status: status(InstagramEventStatus) },
      actions: { ...immutableActions },
    },
  };

  const commentCursor = {
    resource: { model: modelByName('InstagramCommentCursor'), client: prisma },
    options: {
      navigation,
      sort: { sortBy: 'polledAt', direction: 'desc' as const },
      listProperties: ['mediaId', 'igUserId', 'polledAt', 'nextPollAt', 'emptyPolls'],
      filterProperties: ['mediaId', 'igUserId'],
      actions: { ...immutableActions },
    },
  };

  return [connection, pendingLink, dmRule, dmSend, event, commentCursor];
}
