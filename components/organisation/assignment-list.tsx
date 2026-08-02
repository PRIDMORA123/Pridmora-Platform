"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IdentityButton } from "@/components/identity/button";
import { IdentityStatus } from "@/components/identity/status";
import { OrganisationActionsMenu } from "@/components/organisation/organisation-actions-menu";
import {
  formatAssignmentRoleLabel,
  formatAssignmentStatusLabel,
} from "@/lib/organisations/format";

export type AssignmentListRow = {
  id: string;
  clientId: string;
  userId: string;
  assignmentRole: string;
  status: string;
  practitionerName: string;
  clientName: string;
  assignedAt: string;
};

export function AssignmentList({
  assignments,
  busy,
  onEnd,
}: {
  assignments: AssignmentListRow[];
  busy: boolean;
  onEnd: (assignmentId: string) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  async function confirmEnd() {
    if (!confirmId) return;
    setEnding(true);
    try {
      await onEnd(confirmId);
      setConfirmId(null);
    } finally {
      setEnding(false);
    }
  }

  return (
    <>
      <section className="organisation-panel">
        <h2 className="organisation-section-title">Current assignments</h2>

        <div className="organisation-table-wrap">
          <table className="organisation-table">
            <thead>
              <tr>
                <th scope="col">Relationship</th>
                <th scope="col">Practitioner</th>
                <th scope="col">Assignment role</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="organisation-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(row => (
                <tr key={row.id}>
                  <td>{row.clientName}</td>
                  <td>{row.practitionerName}</td>
                  <td>{formatAssignmentRoleLabel(row.assignmentRole)}</td>
                  <td>
                    <IdentityStatus
                      tone={row.status === "active" ? "success" : "neutral"}
                    >
                      {formatAssignmentStatusLabel(row.status)}
                    </IdentityStatus>
                  </td>
                  <td>
                    {row.status === "active" ? (
                      <OrganisationActionsMenu
                        label={`Actions for ${row.clientName}`}
                        items={[
                          {
                            id: "end",
                            label: "End assignment",
                            danger: true,
                            disabled: busy,
                            onSelect: () => setConfirmId(row.id),
                          },
                        ]}
                      />
                    ) : (
                      <span className="organisation-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="organisation-assignment-cards">
          {assignments.map(row => (
            <li key={row.id} className="organisation-member-card">
              <div className="organisation-member-identity">
                <div>
                  <p className="organisation-member-name">{row.clientName}</p>
                  <p className="organisation-member-email">
                    {row.practitionerName}
                  </p>
                </div>
                {row.status === "active" ? (
                  <IdentityButton
                    variant="quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmId(row.id)}
                  >
                    End assignment
                  </IdentityButton>
                ) : null}
              </div>
              <dl className="organisation-member-card__meta">
                <div>
                  <dt>Assignment role</dt>
                  <dd>{formatAssignmentRoleLabel(row.assignmentRole)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <IdentityStatus
                      tone={row.status === "active" ? "success" : "neutral"}
                    >
                      {formatAssignmentStatusLabel(row.status)}
                    </IdentityStatus>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={confirmId != null}
        title="End this assignment?"
        danger
        closeDisabled={ending}
        onClose={() => {
          if (!ending) setConfirmId(null);
        }}
        footer={
          <>
            <IdentityButton
              variant="quiet"
              disabled={ending}
              onClick={() => setConfirmId(null)}
            >
              Cancel
            </IdentityButton>
            <IdentityButton
              variant="danger"
              disabled={ending}
              onClick={() => void confirmEnd()}
            >
              {ending ? "Ending…" : "End assignment"}
            </IdentityButton>
          </>
        }
      >
        <p>
          This will remove the practitioner&apos;s active assignment.
          Relationship history will remain preserved.
        </p>
      </ConfirmDialog>
    </>
  );
}
