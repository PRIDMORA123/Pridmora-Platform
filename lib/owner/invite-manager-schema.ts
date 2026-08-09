import { z } from "zod";

export const inviteManagerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required.")
    .max(200, "Full name is too long."),
  email: z
    .string()
    .trim()
    .email("A valid email address is required.")
    .max(320, "Email is too long.")
    .transform(value => value.toLowerCase()),
  jobTitle: z
    .string()
    .trim()
    .max(200, "Job title is too long.")
    .optional()
    .nullable()
    .transform(value => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
});

export type InviteManagerInput = z.infer<typeof inviteManagerSchema>;
