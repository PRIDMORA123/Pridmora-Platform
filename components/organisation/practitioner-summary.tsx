"use client";

import {
  formatMembershipRoleLabel,
  formatProfessionalRoleLabel,
  organisationInitials,
} from "@/lib/organisations/format";
import type { MembershipRole } from "@/lib/organisations/types";

export type PractitionerSummaryItem = {
  userId: string;
  name: string;
  role: string;
  professionalRole?: string | null;
  assignedCount: number;
};

export function PractitionerSummary({
  practitioners,
}: {
  practitioners: PractitionerSummaryItem[];
}) {
  if (practitioners.length === 0) {
    return (
      <p className="organisation-muted">
        No practitioners with assignments yet.
      </p>
    );
  }

  return (
    <ul className="organisation-practitioner-grid">
      {practitioners.map(practitioner => {
        const professional = formatProfessionalRoleLabel(
          practitioner.professionalRole
        );
        const membership =
          practitioner.role in
          { owner: 1, administrator: 1, oversight: 1, practitioner: 1, viewer: 1 }
            ? formatMembershipRoleLabel(practitioner.role as MembershipRole)
            : null;
        const secondary =
          professional !== "—" ? professional : membership ?? "Practitioner";

        return (
          <li
            key={practitioner.userId}
            className="organisation-practitioner-card"
          >
            <span className="organisation-avatar" aria-hidden="true">
              {organisationInitials(practitioner.name)}
            </span>
            <div>
              <p className="organisation-member-name">{practitioner.name}</p>
              <p className="organisation-member-email">{secondary}</p>
              <p className="organisation-meta">
                {practitioner.assignedCount} active relationship
                {practitioner.assignedCount === 1 ? "" : "s"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
