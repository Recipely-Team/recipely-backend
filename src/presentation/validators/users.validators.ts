import { z } from 'zod';

export const UpdateMyProfileBodySchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(300).optional(),
});
