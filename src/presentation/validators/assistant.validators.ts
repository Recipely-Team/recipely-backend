import { z } from 'zod';

// The language code reaches Google's speech config, so it is constrained to the
// BCP-47 shape rather than passed through: an arbitrary string here would be
// user input travelling into a request we sign with our own API key.
const LanguageCode = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'invalid');

export const MintAssistantSessionBodySchema = z.object({
  languageCode: LanguageCode,
  // Opaque to us — it is Google's handle for continuing a dropped session.
  resumptionHandle: z.string().trim().min(1).max(4096).optional(),
});

export const AssistantHeartbeatBodySchema = z.object({
  // Seconds since the previous heartbeat, not a running total. The use case
  // caps it; this only rejects shapes that were never a duration.
  seconds: z.number().finite().min(0),
});

/**
 * How long the app's screen line may be.
 *
 * @remarks
 * It was 200, which no real screen fits in. The line names the rows the user
 * can see — up to eight recipes — and eight real names from production measure
 * 365 characters before a title, a filter or a draft's ingredients are added.
 * So typing to the assistant from the feed failed the validator outright: a
 * 400 for the one screen the app opens on.
 *
 * Still bounded, because it is user-adjacent text (recipe names are written by
 * users) travelling into a request we sign with our own key. The app clamps to
 * the same number before sending; both sides carry it deliberately, because
 * neither repository can see the other's constant.
 */
const SCREEN_CONTEXT_MAX = 800;

export const AssistantMessageBodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  languageCode: LanguageCode,
  // One line of what the user is looking at, produced by the app.
  screenContext: z.string().trim().max(SCREEN_CONTEXT_MAX).optional(),
});
