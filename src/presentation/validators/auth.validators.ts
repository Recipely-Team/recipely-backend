import { z } from 'zod';
import { DisplayNameSchema } from '@presentation/validators/shared.validators';

export const RegisterBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: DisplayNameSchema,
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

// The device context a client optionally attaches to a login/registration —
// old app versions that never send it must keep working, so it's optional
// everywhere it's used, not just here.
export const DeviceContextBodySchema = z.object({
  deviceId: z.string().min(1).max(128),
  platform: z.enum(['ios', 'android', 'web']),
  appVersion: z.string().max(32).optional(),
});

export const VerifyRegistrationBodySchema = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  device: DeviceContextBodySchema.optional(),
});

export type VerifyRegistrationBody = z.infer<typeof VerifyRegistrationBodySchema>;

export const ResendRegistrationBodySchema = z.object({
  email: z.string().email().max(254),
});

export type ResendRegistrationBody = z.infer<typeof ResendRegistrationBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  device: DeviceContextBodySchema.optional(),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

export const SocialAuthBodySchema = z.object({
  idToken: z.string().min(1),
  device: DeviceContextBodySchema.optional(),
});

export type SocialAuthBody = z.infer<typeof SocialAuthBodySchema>;

export const ForgotPasswordBodySchema = z.object({ email: z.string().email() });
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;
