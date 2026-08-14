"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { IdentityButton } from "@/components/identity/button";
import { BRAND } from "@/lib/brand";
import {
  MEMBERSHIP_ROLE_DESCRIPTIONS,
  MEMBERSHIP_ROLE_LABELS,
  PROFESSIONAL_ROLES,
  type MembershipRole,
  type ProfessionalRole,
} from "@/lib/organisations/types";
import { PROFESSIONAL_ROLE_LABELS } from "@/lib/organisations/format";

type InviteMemberModalProps = {
  open: boolean;
  roles: MembershipRole[];
  busy: boolean;
  seatsAvailable?: number | null;
  /** Lead admin: Manager-only invite (practitioner + manager). */
  variant?: "member" | "manager";
  onClose: () => void;
  onInvite: (input: {
    email: string;
    role: MembershipRole;
    professionalRole: ProfessionalRole | null;
  }) => Promise<{ acceptPath?: string; authEmailSent?: boolean } | null>;
};

export function InviteMemberModal({
  open,
  roles,
  busy,
  seatsAvailable = null,
  variant = "member",
  onClose,
  onInvite,
}: InviteMemberModalProps) {
  const emailId = useId();
  const roleId = useId();
  const professionalId = useId();
  const roleHelpId = useId();
  const liveId = useId();
  const isManagerInvite = variant === "manager";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>(
    isManagerInvite ? "practitioner" : (roles[0] ?? "practitioner")
  );
  const [professionalRole, setProfessionalRole] = useState<ProfessionalRole | "">(
    isManagerInvite ? "manager" : ""
  );
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function reset() {
    setEmail("");
    setRole(isManagerInvite ? "practitioner" : (roles[0] ?? "practitioner"));
    setProfessionalRole(isManagerInvite ? "manager" : "");
    setError("");
    setSent(false);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError("");
    try {
      const result = await onInvite({
        email,
        role: isManagerInvite ? "practitioner" : role,
        professionalRole: isManagerInvite
          ? "manager"
          : professionalRole || null,
      });
      if (result?.authEmailSent || result?.acceptPath) {
        setSent(true);
        setEmail("");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invitation could not be sent."
      );
    }
  }

  if (!open) return null;

  if (sent) {
    return (
      <Modal
        isOpen={open}
        title={
          isManagerInvite ? "Manager invitation sent" : "Invitation sent"
        }
        onClose={handleClose}
        size="md"
        closeDisabled={busy}
        footer={
          <>
            <IdentityButton variant="quiet" onClick={handleClose}>
              Close
            </IdentityButton>
          </>
        }
      >
        <p className="organisation-modal-copy">
          {isManagerInvite
            ? "An invitation email has been sent. The Manager can use the email link to join this organisation."
            : `An invitation email has been sent. Recipients can join on the ${BRAND.productName}.`}
        </p>
        <p id={liveId} className="organisation-sr-live" aria-live="polite">
          Invitation email sent
        </p>
        {error ? <p className="organisation-error">{error}</p> : null}
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={open}
      title={isManagerInvite ? "Invite Manager" : "Invite member"}
      onClose={handleClose}
      size="md"
      closeDisabled={busy}
      onSubmit={event => {
        event.preventDefault();
        void handleSubmit();
      }}
      footer={
        <>
          <IdentityButton
            type="submit"
            variant="primary"
            disabled={
              busy ||
              !email.trim() ||
              ((isManagerInvite || role === "practitioner") &&
                seatsAvailable != null &&
                seatsAvailable < 1)
            }
          >
            {busy
              ? "Sending…"
              : isManagerInvite
                ? "Send Manager invitation"
                : "Send invitation"}
          </IdentityButton>
          <IdentityButton
            type="button"
            variant="quiet"
            onClick={handleClose}
            disabled={busy}
          >
            Cancel
          </IdentityButton>
        </>
      }
    >
      <div className="organisation-form-stack">
        <label className="organisation-field" htmlFor={emailId}>
          <span>Email address</span>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            value={email}
            disabled={busy}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </label>

        {isManagerInvite ? (
          <>
            <div className="organisation-field">
              <span>Role</span>
              <p
                className="organisation-field-readonly"
                id={roleHelpId}
                aria-label="Role: Manager"
              >
                Role: Manager
              </p>
            </div>
            <p className="organisation-field-hint">
              Managers join as practitioners with a Manager professional role and
              consume a licensed practitioner seat. They do not receive
              Organisation Lead or confidential coaching access beyond their own
              assigned relationships.
            </p>
          </>
        ) : (
          <>
            <label className="organisation-field" htmlFor={roleId}>
              <span>Membership role</span>
              <select
                id={roleId}
                value={role}
                disabled={busy}
                aria-describedby={roleHelpId}
                onChange={e => setRole(e.target.value as MembershipRole)}
              >
                {roles.map(option => (
                  <option key={option} value={option}>
                    {MEMBERSHIP_ROLE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <p id={roleHelpId} className="organisation-field-hint">
              {MEMBERSHIP_ROLE_DESCRIPTIONS[role]}
            </p>
            <label className="organisation-field" htmlFor={professionalId}>
              <span>Professional role, optional</span>
              <select
                id={professionalId}
                value={professionalRole}
                disabled={busy}
                onChange={e =>
                  setProfessionalRole(
                    (e.target.value || "") as ProfessionalRole | ""
                  )
                }
              >
                <option value="">Not specified</option>
                {PROFESSIONAL_ROLES.map(option => (
                  <option key={option} value={option}>
                    {PROFESSIONAL_ROLE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {(isManagerInvite || role === "practitioner") &&
        seatsAvailable != null &&
        seatsAvailable < 1 ? (
          <p className="organisation-error" role="status">
            No practitioner seats available. Remove Manager access for an
            existing Manager, or contact your Platform Owner to adjust the
            licence.
          </p>
        ) : null}

        {error ? <p className="organisation-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
