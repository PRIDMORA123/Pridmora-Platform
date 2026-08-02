"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { IdentityButton } from "@/components/identity/button";
import {
  MEMBERSHIP_ROLE_DESCRIPTIONS,
  MEMBERSHIP_ROLE_LABELS,
  type MembershipRole,
} from "@/lib/organisations/types";

export function MemberRoleExplainer() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        className="organisation-text-link"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Understand roles
      </button>

      <Modal
        isOpen={open}
        title="Membership roles"
        onClose={() => setOpen(false)}
        size="md"
        footer={
          <IdentityButton variant="quiet" onClick={() => setOpen(false)}>
            Close
          </IdentityButton>
        }
      >
        <ul className="organisation-role-explainer" aria-labelledby={titleId}>
          {(Object.keys(MEMBERSHIP_ROLE_DESCRIPTIONS) as MembershipRole[]).map(
            role => (
              <li key={role}>
                <strong>{MEMBERSHIP_ROLE_LABELS[role]}</strong>
                <span>{MEMBERSHIP_ROLE_DESCRIPTIONS[role]}</span>
              </li>
            )
          )}
        </ul>
      </Modal>
    </>
  );
}
