"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IdentityButton } from "@/components/identity/button";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { InviteMemberModal } from "@/components/organisation/invite-member-modal";
import { MemberList } from "@/components/organisation/member-list";
import type { OrganisationMemberRow } from "@/components/organisation/member-list";
import { MemberRoleExplainer } from "@/components/organisation/member-role-explainer";
import { apiJson } from "@/lib/api-client";
import type {
  MembershipRole,
  ProfessionalRole,
} from "@/lib/organisations/types";
import { invitableRoles } from "@/lib/organisations/permissions";

type PendingInvitation = {
  id: string;
  email: string;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
  status: string;
  expiresAt: string;
};

export default function OrganisationMembersPage() {
  const [members, setMembers] = useState<OrganisationMemberRow[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [seats, setSeats] = useState<{
    seatsPurchased: number;
    seatsInUse: number;
    seatsAvailable: number;
    label: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actorRole, setActorRole] = useState<MembershipRole | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  // Wait for /api/organisations/current before choosing invite UX — never
  // default to administrator (which would flash the generic role <select>).
  const roleResolved = actorRole != null;
  const isLeadAdmin = actorRole === "oversight";
  const canInvite = canManage && roleResolved;

  const load = useCallback(async () => {
    const [membersPayload, current] = await Promise.all([
      apiJson<{
        members: OrganisationMemberRow[];
        canManage: boolean;
        seats?: {
          seatsPurchased: number;
          seatsInUse: number;
          seatsAvailable: number;
          label: string;
        };
      }>("/api/organisations/members"),
      apiJson<{
        current: { role: MembershipRole };
      }>("/api/organisations/current"),
    ]);
    setMembers(membersPayload.members);
    setCanManage(membersPayload.canManage);
    setSeats(membersPayload.seats ?? null);
    setActorRole(current.current.role);

    if (membersPayload.canManage) {
      try {
        const invitePayload = await apiJson<{
          invitations: Array<{
            id: string;
            email: string;
            role: MembershipRole;
            professionalRole: ProfessionalRole | null;
            status: string;
            expiresAt: string;
          }>;
        }>("/api/organisations/invitations");
        setInvitations(
          (invitePayload.invitations ?? []).filter(
            row => row.status === "pending"
          )
        );
      } catch {
        setInvitations([]);
      }
    } else {
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    load().catch(err =>
      setError(err instanceof Error ? err.message : "Unable to load members.")
    );
  }, [load]);

  async function inviteMember(input: {
    email: string;
    role: MembershipRole;
    professionalRole: ProfessionalRole | null;
  }): Promise<{ acceptPath?: string; authEmailSent?: boolean } | null> {
    setBusy(true);
    setError("");
    try {
      const role = isLeadAdmin ? "practitioner" : input.role;
      const professionalRole = isLeadAdmin ? "manager" : input.professionalRole;
      const result = await apiJson<{
        acceptPath: string;
        authEmailSent?: boolean;
      }>("/api/organisations/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          role,
          professionalRole,
        }),
      });
      await load();
      if (!result.authEmailSent && !result.acceptPath) {
        throw new Error("The invitation email could not be sent.");
      }
      return {
        acceptPath: result.acceptPath,
        authEmailSent: result.authEmailSent ?? true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invite failed.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(
    membershipId: string,
    status: "active" | "deactivated"
  ) {
    setBusy(true);
    setError("");
    try {
      await apiJson("/api/organisations/members", {
        method: "PATCH",
        body: JSON.stringify({ membershipId, status }),
      });
      await load();
      setDeactivateId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(membershipId: string, role: MembershipRole) {
    setBusy(true);
    setError("");
    try {
      await apiJson("/api/organisations/members", {
        method: "PATCH",
        body: JSON.stringify({ membershipId, role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role change failed.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setBusy(true);
    setError("");
    try {
      await apiJson("/api/organisations/invitations", {
        method: "POST",
        body: JSON.stringify({ action: "revoke", invitationId }),
      });
      await load();
      setRevokeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke invitation.");
    } finally {
      setBusy(false);
    }
  }

  const roles = actorRole ? invitableRoles(actorRole) : [];
  const singleMember = members.length === 1;
  const deactivateTarget = members.find(member => member.id === deactivateId);
  const revokeTarget = invitations.find(invite => invite.id === revokeId);
  const inviteCta = isLeadAdmin ? "Invite Manager" : "Invite member";
  const removeAccessTitle = isLeadAdmin
    ? "Remove Manager access?"
    : "Deactivate member?";
  const removeAccessConfirm = isLeadAdmin
    ? "Remove Manager access"
    : "Deactivate member";
  const removeAccessBusy = isLeadAdmin ? "Removing…" : "Deactivating…";

  return (
    <OrganisationShell
      title="Members"
      subtitle={
        isLeadAdmin
          ? "Manage Manager membership and licensed seats for this organisation."
          : "Manage organisation access and practitioner roles."
      }
    >
      {error ? <p className="organisation-error">{error}</p> : null}

      {seats ? (
        <div className="organisation-seats-summary">
          <p className="organisation-seats-summary__label">Seats</p>
          <p className="organisation-seats-summary__value">{seats.label}</p>
        </div>
      ) : null}

      {canInvite ? (
        <div className="organisation-members-toolbar">
          <IdentityButton
            variant="primary"
            onClick={() => setInviteOpen(true)}
            disabled={busy}
          >
            {inviteCta}
          </IdentityButton>
          {roleResolved && !isLeadAdmin ? <MemberRoleExplainer /> : null}
        </div>
      ) : null}

      {canInvite && singleMember ? (
        <section className="organisation-empty-state">
          <p>You are currently the only member of this workspace.</p>
          <p className="organisation-muted">
            {isLeadAdmin
              ? "Invite a Manager when you are ready to onboard the first practitioner seat."
              : "Invite another practitioner or administrator when you are ready to work as a team."}
          </p>
          <IdentityButton
            variant="secondary"
            onClick={() => setInviteOpen(true)}
            disabled={busy}
          >
            {inviteCta}
          </IdentityButton>
        </section>
      ) : null}

      {canInvite && invitations.length > 0 ? (
        <section className="organisation-panel">
          <h2 className="organisation-section-title">Pending invitations</h2>
          <ul className="organisation-attention-list">
            {invitations.map(invite => (
              <li key={invite.id} className="organisation-attention-item">
                <p className="organisation-attention-item__title">
                  {invite.email}
                </p>
                <p className="organisation-attention-item__meta">
                  {invite.professionalRole === "manager" ||
                  invite.role === "practitioner"
                    ? "Manager invitation"
                    : "Member invitation"}{" "}
                  · expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
                <IdentityButton
                  variant="quiet"
                  disabled={busy}
                  onClick={() => setRevokeId(invite.id)}
                >
                  Revoke invitation
                </IdentityButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="organisation-panel">
        <MemberList
          members={members}
          canManage={canManage}
          busy={busy}
          invitableRoles={roles}
          removeAccessLabel={
            isLeadAdmin ? "Remove Manager access" : "Deactivate member"
          }
          restoreAccessLabel={
            isLeadAdmin ? "Restore Manager access" : "Reactivate member"
          }
          onChangeRole={(id, role) => void changeRole(id, role)}
          onDeactivate={id => setDeactivateId(id)}
          onReactivate={id => void setStatus(id, "active")}
        />
      </section>

      {canInvite ? (
        <InviteMemberModal
          open={inviteOpen}
          roles={roles}
          busy={busy}
          seatsAvailable={seats?.seatsAvailable ?? null}
          variant={isLeadAdmin ? "manager" : "member"}
          onClose={() => setInviteOpen(false)}
          onInvite={inviteMember}
        />
      ) : null}

      <ConfirmDialog
        open={deactivateId != null}
        title={removeAccessTitle}
        danger
        closeDisabled={busy}
        onClose={() => {
          if (!busy) setDeactivateId(null);
        }}
        footer={
          <>
            <IdentityButton
              variant="quiet"
              disabled={busy}
              onClick={() => setDeactivateId(null)}
            >
              Cancel
            </IdentityButton>
            <IdentityButton
              variant="danger"
              disabled={busy || !deactivateId}
              onClick={() =>
                deactivateId
                  ? void setStatus(deactivateId, "deactivated")
                  : undefined
              }
            >
              {busy ? removeAccessBusy : removeAccessConfirm}
            </IdentityButton>
          </>
        }
      >
        <p>
          {deactivateTarget
            ? `${deactivateTarget.name} will lose active access to this workspace. Membership history will remain preserved. The Auth account is not deleted.`
            : "This member will lose active access to this workspace. Membership history will remain preserved. The Auth account is not deleted."}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={revokeId != null}
        title="Revoke invitation?"
        danger
        closeDisabled={busy}
        onClose={() => {
          if (!busy) setRevokeId(null);
        }}
        footer={
          <>
            <IdentityButton
              variant="quiet"
              disabled={busy}
              onClick={() => setRevokeId(null)}
            >
              Cancel
            </IdentityButton>
            <IdentityButton
              variant="danger"
              disabled={busy || !revokeId}
              onClick={() =>
                revokeId ? void revokeInvitation(revokeId) : undefined
              }
            >
              {busy ? "Revoking…" : "Revoke invitation"}
            </IdentityButton>
          </>
        }
      >
        <p>
          {revokeTarget
            ? `The pending invitation for ${revokeTarget.email} will be revoked. Invitation history will remain for audit.`
            : "This pending invitation will be revoked. Invitation history will remain for audit."}
        </p>
      </ConfirmDialog>
    </OrganisationShell>
  );
}
