"use client";

import { useOrganisation } from "@/lib/organisations/organisation-context";
import { ORGANISATION_TYPE_LABELS } from "@/lib/organisations/types";

/**
 * Restrained workspace selector — only shown for multi-organisation users.
 */
export function WorkspaceSelector() {
  const org = useOrganisation();
  if (!org?.showWorkspaceSelector) return null;

  return (
    <label className="workspace-selector">
      <span className="workspace-selector__label">Workspace</span>
      <select
        className="workspace-selector__select"
        value={org.organisation.id}
        aria-label="Switch organisation workspace"
        onChange={event => {
          void org.switchOrganisation(event.target.value);
        }}
      >
        {org.organisations.map(({ organisation }) => (
          <option key={organisation.id} value={organisation.id}>
            {organisation.name} · {ORGANISATION_TYPE_LABELS[organisation.organisationType]}
          </option>
        ))}
      </select>
    </label>
  );
}
