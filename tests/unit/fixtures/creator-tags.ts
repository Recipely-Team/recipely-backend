import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorTag } from '@domain/users/creator-tag';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { ModerationStatus } from '@domain/moderation/moderation-status';

export const REQUESTED_AT = new Date('2026-09-01T10:00:00Z');
export const REVIEWED_AT = new Date('2026-09-02T10:00:00Z');
export const NOW = new Date('2026-09-30T12:00:00Z');

export function pendingTag(raw = 'ada', platform: CreatorPlatform = CreatorPlatform.Instagram): CreatorTag {
  const handle = CreatorHandle.create(platform, raw);
  if (!handle.ok) throw new Error('fixture handle invalid');
  return CreatorTag.request(handle.value, REQUESTED_AT, null);
}

export function approvedTag(raw = 'ada', platform: CreatorPlatform = CreatorPlatform.Instagram): CreatorTag {
  const result = pendingTag(raw, platform).approve(REVIEWED_AT);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

export function rejectedTag(raw = 'ada'): CreatorTag {
  const result = pendingTag(raw).reject(REVIEWED_AT);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

export function approvingModerator(): ContentModeratorInterface & { moderate: jest.Mock } {
  return { moderate: jest.fn(() => ({ status: ModerationStatus.Approved })) };
}
