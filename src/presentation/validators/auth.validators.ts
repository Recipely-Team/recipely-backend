import { z } from 'zod';

export const RegisterBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

export const SocialAuthBodySchema = z.object({
  idToken: z.string().min(1),
});

export type SocialAuthBody = z.infer<typeof SocialAuthBodySchema>;
