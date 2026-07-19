import { z } from 'zod';
import { DisplayNameSchema } from '@presentation/validators/shared.validators';

export const UpdateMyProfileBodySchema = z.object({
  displayName: DisplayNameSchema.optional(),
  bio: z.string().max(300).optional(),
});
