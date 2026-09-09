"use client";

import { organisationInitials } from "@/lib/organisations/format";

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
        No Managers with assignments yet.
      </p>
    );
  }

  return (
    <ul className="organisation-practitioner-grid">
      {practitioners.map(practitioner => {
        const secondary = "Manager";

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
