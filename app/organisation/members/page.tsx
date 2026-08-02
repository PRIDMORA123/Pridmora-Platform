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

export default function OrganisationMembersPage() {
  const [members, setMembers] = useState<OrganisationMemberRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actorRole, setActorRole] = useState<MembershipRole>("administrator");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [membersPayload, current] = await Promise.all([
      apiJson<{ members: OrganisationMemberRow[]; canManage: boolean }>(
        "/api/organisations/members"
      ),
      apiJson<{
        current: { role: MembershipRole };
      }>("/api/organisations/current"),
    ]);
    setMembers(membersPayload.members);
    setCanManage(membersPayload.canManage);
    setActorRole(current.current.role);
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
  }): Promise<{ acceptPath: string } | null> {
    setBusy(true);
    setError("");
    try {
      const result = await apiJson<{ acceptPath: string }>(
        "/api/organisations/invitations",
        {
          method: "POST",
          body: JSON.stringify({
            email: input.email,
            role: input.role,
            professionalRole: input.professionalRole,
          }),
        }
      );
      await load();
      return { acceptPath: result.acceptPath };
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

  const roles = invitableRoles(actorRole);
  const singleMember = members.length === 1;
  const deactivateTarget = members.find(member => member.id === deactivateId);

  return (
    <OrganisationShell
      title="Members"
      subtitle="Manage organisation access and practitioner roles."
    >
      {error ? <p className="organisation-error">{error}</p> : null}

      {canManage ? (
        <div className="organisation-members-toolbar">
          <IdentityButton
            variant="primary"
            onClick={() => setInviteOpen(true)}
            disabled={busy}
          >
            Invite member
          </IdentityButton>
          <MemberRoleExplainer />
        </div>
      ) : null}

      {canManage && singleMember ? (
        <section className="organisation-empty-state">
          <p>You are currently the only member of this workspace.</p>
          <p className="organisation-muted">
            Invite another practitioner or administrator when you are ready to
            work as a team.
          </p>
          <IdentityButton
            variant="secondary"
            onClick={() => setInviteOpen(true)}
            disabled={busy}
          >
            Invite member
          </IdentityButton>
        </section>
      ) : null}

      <section className="organisation-panel">
        <MemberList
          members={members}
          canManage={canManage}
          busy={busy}
          invitableRoles={roles}
          onChangeRole={(id, role) => void changeRole(id, role)}
          onDeactivate={id => setDeactivateId(id)}
          onReactivate={id => void setStatus(id, "active")}
        />
      </section>

      {canManage ? (
        <InviteMemberModal
          open={inviteOpen}
          roles={roles}
          busy={busy}
          onClose={() => setInviteOpen(false)}
          onInvite={inviteMember}
        />
      ) : null}

      <ConfirmDialog
        open={deactivateId != null}
        title="Deactivate member?"
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
              {busy ? "Deactivating…" : "Deactivate member"}
            </IdentityButton>
          </>
        }
      >
        <p>
          {deactivateTarget
            ? `${deactivateTarget.name} will lose active access to this workspace. Relationship history will remain preserved.`
            : "This member will lose active access to this workspace. Relationship history will remain preserved."}
        </p>
      </ConfirmDialog>
    </OrganisationShell>
  );
}
