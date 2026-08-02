"use client";

import { IdentityStatus } from "@/components/identity/status";
import { OrganisationActionsMenu } from "@/components/organisation/organisation-actions-menu";
import {
  formatMembershipRoleLabel,
  formatMembershipStatusLabel,
  formatOrganisationDate,
  formatProfessionalRoleLabel,
  organisationInitials,
} from "@/lib/organisations/format";
import {
  MEMBERSHIP_ROLE_LABELS,
  type MembershipRole,
} from "@/lib/organisations/types";

export type OrganisationMemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: MembershipRole;
  professionalRole: string | null;
  status: string;
  assignedRelationshipsCount: number;
  lastActiveAt: string | null;
};

function memberActions({
  member,
  canManage,
  busy,
  invitableRoles,
  onChangeRole,
  onDeactivate,
  onReactivate,
}: {
  member: OrganisationMemberRow;
  canManage: boolean;
  busy: boolean;
  invitableRoles: MembershipRole[];
  onChangeRole: (membershipId: string, role: MembershipRole) => void;
  onDeactivate: (membershipId: string) => void;
  onReactivate: (membershipId: string) => void;
}) {
  const actions = [];
  if (canManage && member.role !== "owner") {
    if (member.status === "active") {
      actions.push({
        id: "deactivate",
        label: "Deactivate member",
        danger: true,
        disabled: busy,
        onSelect: () => onDeactivate(member.id),
      });
    }
    if (member.status === "deactivated") {
      actions.push({
        id: "reactivate",
        label: "Reactivate member",
        disabled: busy,
        onSelect: () => onReactivate(member.id),
      });
    }
    for (const role of invitableRoles) {
      if (role === member.role) continue;
      actions.push({
        id: `role-${role}`,
        label: `Make ${MEMBERSHIP_ROLE_LABELS[role]}`,
        disabled: busy,
        onSelect: () => onChangeRole(member.id, role),
      });
    }
  }
  return actions;
}

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "deactivated") return "neutral" as const;
  return "info" as const;
}

export function MemberRow({
  member,
  canManage,
  busy,
  invitableRoles,
  onChangeRole,
  onDeactivate,
  onReactivate,
}: {
  member: OrganisationMemberRow;
  canManage: boolean;
  busy: boolean;
  invitableRoles: MembershipRole[];
  onChangeRole: (membershipId: string, role: MembershipRole) => void;
  onDeactivate: (membershipId: string) => void;
  onReactivate: (membershipId: string) => void;
}) {
  const actions = memberActions({
    member,
    canManage,
    busy,
    invitableRoles,
    onChangeRole,
    onDeactivate,
    onReactivate,
  });

  return (
    <tr>
      <td>
        <div className="organisation-member-identity">
          <span className="organisation-avatar" aria-hidden="true">
            {organisationInitials(member.name)}
          </span>
          <div>
            <p className="organisation-member-name">{member.name}</p>
            {member.email ? (
              <p className="organisation-member-email">{member.email}</p>
            ) : null}
          </div>
        </div>
      </td>
      <td>{formatMembershipRoleLabel(member.role)}</td>
      <td>{formatProfessionalRoleLabel(member.professionalRole)}</td>
      <td>{member.assignedRelationshipsCount}</td>
      <td>
        <IdentityStatus tone={statusTone(member.status)}>
          {formatMembershipStatusLabel(member.status)}
        </IdentityStatus>
      </td>
      <td className="organisation-meta">
        {formatOrganisationDate(member.lastActiveAt)}
      </td>
      <td>
        <OrganisationActionsMenu
          label={`Actions for ${member.name}`}
          items={actions}
        />
      </td>
    </tr>
  );
}

export function MemberCard({
  member,
  canManage,
  busy,
  invitableRoles,
  onChangeRole,
  onDeactivate,
  onReactivate,
}: {
  member: OrganisationMemberRow;
  canManage: boolean;
  busy: boolean;
  invitableRoles: MembershipRole[];
  onChangeRole: (membershipId: string, role: MembershipRole) => void;
  onDeactivate: (membershipId: string) => void;
  onReactivate: (membershipId: string) => void;
}) {
  const actions = memberActions({
    member,
    canManage,
    busy,
    invitableRoles,
    onChangeRole,
    onDeactivate,
    onReactivate,
  });

  return (
    <li className="organisation-member-card">
      <div className="organisation-member-identity">
        <span className="organisation-avatar" aria-hidden="true">
          {organisationInitials(member.name)}
        </span>
        <div>
          <p className="organisation-member-name">{member.name}</p>
          {member.email ? (
            <p className="organisation-member-email">{member.email}</p>
          ) : null}
        </div>
        <OrganisationActionsMenu
          label={`Actions for ${member.name}`}
          items={actions}
        />
      </div>
      <dl className="organisation-member-card__meta">
        <div>
          <dt>Membership</dt>
          <dd>{formatMembershipRoleLabel(member.role)}</dd>
        </div>
        <div>
          <dt>Professional role</dt>
          <dd>{formatProfessionalRoleLabel(member.professionalRole)}</dd>
        </div>
        <div>
          <dt>Assigned relationships</dt>
          <dd>{member.assignedRelationshipsCount}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <IdentityStatus tone={statusTone(member.status)}>
              {formatMembershipStatusLabel(member.status)}
            </IdentityStatus>
          </dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd>{formatOrganisationDate(member.lastActiveAt)}</dd>
        </div>
      </dl>
    </li>
  );
}

export function MemberList({
  members,
  canManage,
  busy,
  invitableRoles,
  onChangeRole,
  onDeactivate,
  onReactivate,
}: {
  members: OrganisationMemberRow[];
  canManage: boolean;
  busy: boolean;
  invitableRoles: MembershipRole[];
  onChangeRole: (membershipId: string, role: MembershipRole) => void;
  onDeactivate: (membershipId: string) => void;
  onReactivate: (membershipId: string) => void;
}) {
  const shared = {
    canManage,
    busy,
    invitableRoles,
    onChangeRole,
    onDeactivate,
    onReactivate,
  };

  return (
    <>
      <div className="organisation-table-wrap">
        <table className="organisation-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Membership</th>
              <th scope="col">Professional role</th>
              <th scope="col">Assigned relationships</th>
              <th scope="col">Status</th>
              <th scope="col">Last active</th>
              <th scope="col">
                <span className="organisation-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => (
              <MemberRow key={member.id} member={member} {...shared} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="organisation-member-cards">
        {members.map(member => (
          <MemberCard key={member.id} member={member} {...shared} />
        ))}
      </ul>
    </>
  );
}
