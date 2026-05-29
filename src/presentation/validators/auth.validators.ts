import { z } from 'zod';

export const RegisterBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const VerifyRegistrationBodySchema = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/),
});

export type VerifyRegistrationBody = z.infer<typeof VerifyRegistrationBodySchema>;

export const ResendRegistrationBodySchema = z.object({
  email: z.string().email().max(254),
});

export type ResendRegistrationBody = z.infer<typeof ResendRegistrationBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

export const SocialAuthBodySchema = z.object({
  idToken: z.string().min(1),
});

export type SocialAuthBody = z.infer<typeof SocialAuthBodySchema>;

export const ForgotPasswordBodySchema = z.object({ email: z.string().email() });
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;
