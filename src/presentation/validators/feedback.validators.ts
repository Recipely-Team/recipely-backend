import { z } from 'zod';

export const SubmitFeedbackBodySchema = z.object({
  category: z.enum(['bug', 'suggestion', 'help', 'other']),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
  rating: z.number().int().min(1).max(5).optional(),
  contactEmail: z.string().email().optional(),
});
