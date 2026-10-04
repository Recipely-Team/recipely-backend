import type { InstagramConnection } from '@domain/instagram/instagram-connection';
import type { DmRuleListData } from '@domain/instagram/dm-rule-repository-interface';
import type { DmSendRecord } from '@domain/instagram/dm-send-repository-interface';
import type { InstagramMediaData } from '@application/instagram/ports/instagram-graph-interface';
import type { InstagramConnectionDto } from '@application/instagram/dtos/instagram-connection.dto';
import type { InstagramMediaDto } from '@application/instagram/dtos/instagram-media.dto';
import type { DmRuleDto } from '@application/instagram/dtos/dm-rule.dto';
import type { DmSendDto } from '@application/instagram/dtos/dm-send.dto';

const FALLBACK_LOCALE = 'en';

/** **Instagram automation read models → wire.** */
export class InstagramMapper {
  static connection(connection: InstagramConnection | null, available: boolean): InstagramConnectionDto {
    if (connection === null) {
      return { connected: false, available, username: null, igUserId: null, status: null, tokenExpiresAt: null, connectedAt: null };
    }
    return {
      connected: true,
      available,
      username: connection.username,
      igUserId: connection.igUserId,
      status: connection.status,
      tokenExpiresAt: connection.tokenExpiresAt.toISOString(),
      connectedAt: connection.connectedAt.toISOString(),
    };
  }

  static media(media: InstagramMediaData): InstagramMediaDto {
    return { ...media, timestamp: media.timestamp?.toISOString() ?? null };
  }

  static rule({ rule, sentCount, recipe }: DmRuleListData, locale: string): DmRuleDto {
    const names = recipe?.names ?? {};
    return {
      id: rule.id,
      mediaId: rule.mediaId,
      media: rule.media,
      keywords: rule.keywords,
      recipeId: rule.recipeId,
      recipe: recipe === null ? null : { id: recipe.id, name: names[locale] ?? names[FALLBACK_LOCALE] ?? Object.values(names)[0] ?? '', image: recipe.image },
      dmText: rule.dmText,
      publicReplyText: rule.publicReplyText,
      enabled: rule.enabled,
      sentCount,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  static send(send: DmSendRecord): DmSendDto {
    return {
      id: send.id,
      commentId: send.commentId,
      commenterUsername: send.commenterUsername,
      commentText: send.commentText,
      status: send.status,
      reason: send.reason,
      publicReplied: send.publicReplied,
      createdAt: send.createdAt.toISOString(),
      sentAt: send.sentAt?.toISOString() ?? null,
    };
  }
}
