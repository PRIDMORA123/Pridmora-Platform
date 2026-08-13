/**
 * Owner Console Lead invite surface.
 * Lead membership: role = oversight, professional_role = null.
 * Does not consume practitioner seats. Does not grant members.invite.
 */

export {
  inviteOrganisationLead,
  listOwnerLeadInvitations,
  type InviteOrganisationMemberResult as InviteLeadResult,
  type OwnerOrganisationInvitation as OwnerLeadInvitation,
} from "@/lib/owner/invite-organisation-member";
