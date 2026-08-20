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
