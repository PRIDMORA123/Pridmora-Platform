"use client";

import { useId } from "react";
import { IdentityButton } from "@/components/identity/button";
import { ASSIGNMENT_ROLE_LABELS } from "@/lib/organisations/format";
import {
  ASSIGNMENT_ROLES,
  type AssignmentRole,
} from "@/lib/organisations/types";

type RelationshipOption = { id: string; name: string };
type PractitionerOption = { userId: string; name: string };

export function AssignmentForm({
  relationships,
  practitioners,
  clientId,
  userId,
  assignmentRole,
  busy,
  success,
  onClientIdChange,
  onUserIdChange,
  onAssignmentRoleChange,
  onSubmit,
}: {
  relationships: RelationshipOption[];
  practitioners: PractitionerOption[];
  clientId: string;
  userId: string;
  assignmentRole: AssignmentRole;
  busy: boolean;
  success?: string;
  onClientIdChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  onAssignmentRoleChange: (value: AssignmentRole) => void;
  onSubmit: () => void;
}) {
  const relationshipId = useId();
  const practitionerId = useId();
  const roleId = useId();

  return (
    <section className="organisation-panel organisation-assignment-panel">
      <h2 className="organisation-section-title">Assign a relationship</h2>
      <form
        className="organisation-assignment-form"
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="organisation-field" htmlFor={relationshipId}>
          <span>Relationship</span>
          <select
            id={relationshipId}
            value={clientId}
            disabled={busy || relationships.length === 0}
            onChange={e => onClientIdChange(e.target.value)}
          >
            {relationships.length === 0 ? (
              <option value="">No relationships available</option>
            ) : null}
            {relationships.map(relationship => (
              <option key={relationship.id} value={relationship.id}>
                {relationship.name}
              </option>
            ))}
          </select>
        </label>

        <label className="organisation-field" htmlFor={practitionerId}>
          <span>Practitioner</span>
          <select
            id={practitionerId}
            value={userId}
            disabled={busy || practitioners.length === 0}
            onChange={e => onUserIdChange(e.target.value)}
          >
            {practitioners.length === 0 ? (
              <option value="">No practitioners available</option>
            ) : null}
            {practitioners.map(practitioner => (
              <option key={practitioner.userId} value={practitioner.userId}>
                {practitioner.name}
              </option>
            ))}
          </select>
        </label>

        <label className="organisation-field" htmlFor={roleId}>
          <span>Assignment role</span>
          <select
            id={roleId}
            value={assignmentRole}
            disabled={busy}
            onChange={e =>
              onAssignmentRoleChange(e.target.value as AssignmentRole)
            }
          >
            {ASSIGNMENT_ROLES.map(role => (
              <option key={role} value={role}>
                {ASSIGNMENT_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>

        <div className="organisation-assignment-form__actions">
          <IdentityButton
            type="submit"
            variant="primary"
            disabled={busy || !clientId || !userId}
          >
            {busy ? "Saving…" : "Save assignment"}
          </IdentityButton>
          {success ? (
            <p className="organisation-success-message" role="status">
              {success}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
