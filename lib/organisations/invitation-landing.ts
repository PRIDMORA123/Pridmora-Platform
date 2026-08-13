/**
 * Client-safe invitation landing helpers.
 * Keep Node-only crypto / server invitation writers out of this module so
 * browser accept pages can import it without bundling `node:crypto`.
 */

/**
 * Post-accept landing from server-returned membership role values only.
 * Never trust URL/client-supplied role.
 */
export function resolveInvitationAcceptLanding(input: {
  role: string;
  professionalRole?: string | null;
}): string {
  if (
    input.role === "oversight" ||
    input.role === "owner" ||
    input.role === "administrator"
  ) {
    return "/organisation";
  }
  if (
    input.role === "practitioner" &&
    input.professionalRole === "manager"
  ) {
    return "/?view=dashboard";
  }
  return "/?view=dashboard";
}
