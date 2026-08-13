/**
 * Owner Console Manager invite surface.
 * Implementation lives in invite-organisation-member.ts (shared Lead/Manager plumbing).
 * Manager behaviour remains: role = practitioner, professional_role = manager.
 */

export {
  buildOrganisationInviteAcceptNext as buildManagerInviteAcceptNext,
  buildOrganisationInviteRedirectTo as buildManagerInviteRedirectTo,
  countPendingPractitionerInvites,
  inviteOrganisationManager,
  listOwnerManagerInvitations,
  type InviteOrganisationMemberResult as InviteManagerResult,
  type OwnerOrganisationInvitation as OwnerManagerInvitation,
} from "@/lib/owner/invite-organisation-member";
