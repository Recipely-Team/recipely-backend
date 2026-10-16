import type { SourcePlatformType } from '@domain/recipes/source-platform';

/**
 * Translation keys for the push an import sends when it finishes.
 *
 * @remarks
 * - **Why keys and not sentences.** The push is the one piece of import copy
 *   the server writes, because FCM has to render it while the app is closed —
 *   everything else in the app is worded client-side. A sentence written here
 *   would reach a Turkish user in English and there would be nothing the client
 *   could do about it.
 * - **Why a constant and not the string at the call site.** A key typed at the
 *   call site does not fail when it is wrong: i18next returns the key itself,
 *   so the user gets `notifications.import.done.titel` as their notification
 *   title and nothing anywhere reports a problem.
 */
export const ImportNotificationKeys = {
  doneTitle: 'notifications.import.done.title',
  /** Takes `{{title}}` — the name of the recipe that was extracted. */
  doneBody: 'notifications.import.done.body',
  /** Per source: `{{title}}`, and for a web page `{{site}}` — the push says where the recipe came from. */
  doneBodyFor: (platform: SourcePlatformType): string => `notifications.import.done.body.${platform.toLowerCase()}`,
  /** Takes `{{title}}`: the post showed a dish and no recipe, so the draft is one we wrote for it. */
  doneSuggestedBody: 'notifications.import.done.body.suggested',
  failedTitle: 'notifications.import.failed.title',
  failedBody: 'notifications.import.failed.body',
} as const;
