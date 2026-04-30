import { z } from 'zod';

export const ListCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  locale: z.string().optional(),
});

export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;