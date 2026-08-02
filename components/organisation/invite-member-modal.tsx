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
  onClose: () => void;
  onInvite: (input: {
    email: string;
    role: MembershipRole;
    professionalRole: ProfessionalRole | null;
  }) => Promise<{ acceptPath: string } | null>;
};

export function InviteMemberModal({
  open,
  roles,
  busy,
  seatsAvailable = null,
  onClose,
  onInvite,
}: InviteMemberModalProps) {
  const emailId = useId();
  const roleId = useId();
  const professionalId = useId();
  const roleHelpId = useId();
  const liveId = useId();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>(
    roles[0] ?? "practitioner"
  );
  const [professionalRole, setProfessionalRole] = useState<ProfessionalRole | "">(
    ""
  );
  const [error, setError] = useState("");
  const [acceptPath, setAcceptPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail("");
    setRole(roles[0] ?? "practitioner");
    setProfessionalRole("");
    setError("");
    setAcceptPath(null);
    setCopied(false);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError("");
    setCopied(false);
    try {
      const result = await onInvite({
        email,
        role,
        professionalRole: professionalRole || null,
      });
      if (result?.acceptPath) {
        setAcceptPath(result.acceptPath);
        setEmail("");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invitation could not be sent."
      );
    }
  }

  async function copyLink() {
    if (!acceptPath) return;
    const absolute =
      typeof window !== "undefined"
        ? `${window.location.origin}${acceptPath}`
        : acceptPath;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
    } catch {
      setError("Unable to copy the invitation link. Please try again.");
    }
  }

  if (!open) return null;

  if (acceptPath) {
    return (
      <Modal
        isOpen={open}
        title="Invitation created"
        onClose={handleClose}
        size="md"
        closeDisabled={busy}
        footer={
          <>
            <IdentityButton
              variant="secondary"
              onClick={copyLink}
              disabled={busy}
            >
              Copy invitation link
            </IdentityButton>
            <IdentityButton variant="quiet" onClick={handleClose}>
              Close
            </IdentityButton>
          </>
        }
      >
        <p className="organisation-modal-copy">
          The invitation can now be shared securely. Recipients are invited to
          join on the {BRAND.productName}.
        </p>
        <p id={liveId} className="organisation-sr-live" aria-live="polite">
          {copied ? "Invitation link copied" : ""}
        </p>
        {copied ? (
          <p className="organisation-success-message" aria-hidden="true">
            Invitation link copied
          </p>
        ) : null}
        {error ? <p className="organisation-error">{error}</p> : null}
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={open}
      title="Invite member"
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
              (role === "practitioner" &&
                seatsAvailable != null &&
                seatsAvailable < 1)
            }
          >
            {busy ? "Sending…" : "Send invitation"}
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
        {role === "practitioner" &&
        seatsAvailable != null &&
        seatsAvailable < 1 ? (
          <p className="organisation-error" role="status">
            No practitioner seats available. Choose another role, or deactivate
            an existing practitioner to free a seat.
          </p>
        ) : null}

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

        {error ? <p className="organisation-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
