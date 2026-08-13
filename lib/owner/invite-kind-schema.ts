import { z } from "zod";
import { inviteManagerSchema } from "@/lib/owner/invite-manager-schema";
import { OWNER_INVITE_KINDS } from "@/lib/owner/invite-organisation-member";

/**
 * Owner Console invite payload.
 * Browser may choose inviteKind only — never membership role or professional_role.
 */
export const ownerInvitePayloadSchema = inviteManagerSchema
  .extend({
    inviteKind: z.enum(OWNER_INVITE_KINDS).default("manager"),
  })
  .strict();

export type OwnerInvitePayload = z.infer<typeof ownerInvitePayloadSchema>;
