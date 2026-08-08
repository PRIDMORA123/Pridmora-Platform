"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { OwnerConfirmDialog } from "@/components/owner/owner-confirm-dialog";
import { apiJson } from "@/lib/api-client";
import type { OwnerUserListItem } from "@/lib/owner/types";
import { MEMBERSHIP_ROLES } from "@/lib/organisations/types";

type PendingAction = {
  membershipId: string;
  action: "suspend" | "reactivate" | "password_reset" | "resend_invitation" | "change_role";
  role?: string;
  label: string;
  description: string;
};

export default function OwnerUsersPage() {
  const [users, setUsers] = useState<OwnerUserListItem[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (role !== "all") params.set("role", role);
    if (status !== "all") params.set("status", status);
    try {
      const payload = await apiJson<{ users: OwnerUserListItem[] }>(
        `/api/owner/users?${params.toString()}`
      );
      setUsers(payload.users);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role, status]);

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    try {
      await apiJson(`/api/owner/users/${pending.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pending.action,
          role: pending.role,
        }),
      });
      setPending(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerShell
      title="Users"
      subtitle="Platform user administration across organisations. Credentials are never displayed."
    >
      <div className="owner-filters">
        <div className="owner-field">
          <label htmlFor="owner-user-search">Search</label>
          <input
            id="owner-user-search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Name, email or organisation"
          />
        </div>
        <div className="owner-field">
          <label htmlFor="owner-user-role">Role</label>
          <select
            id="owner-user-role"
            value={role}
            onChange={event => setRole(event.target.value)}
          >
            <option value="all">All</option>
            {MEMBERSHIP_ROLES.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="owner-field">
          <label htmlFor="owner-user-status">Status</label>
          <select
            id="owner-user-status"
            value={status}
            onChange={event => setStatus(event.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Suspended</option>
          </select>
        </div>
      </div>

      {loading ? <p className="owner-muted">Loading users…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {!loading && users.length === 0 ? (
        <OwnerEmpty
          title="No users found"
          description="Membership records will appear here once organisations invite people."
        />
      ) : null}

      {users.length > 0 ? (
        <>
          <div className="owner-table-wrap">
            <table className="owner-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Organisation</th>
                  <th scope="col">Role</th>
                  <th scope="col">Account status</th>
                  <th scope="col">Last sign in</th>
                  <th scope="col">Created</th>
                  <th scope="col">Invitation</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.membershipId}>
                    <td>
                      <div>{user.fullName || "—"}</div>
                      <div className="owner-muted">{user.email || "—"}</div>
                    </td>
                    <td>{user.organisationName}</td>
                    <td>
                      <select
                        aria-label={`Role for ${user.fullName || user.email}`}
                        value={roleDraft[user.membershipId] ?? user.role}
                        onChange={event =>
                          setRoleDraft(prev => ({
                            ...prev,
                            [user.membershipId]: event.target.value,
                          }))
                        }
                      >
                        {MEMBERSHIP_ROLES.filter(item => item !== "owner").map(item => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <OwnerStatus value={user.status} label={user.status} />
                    </td>
                    <td>
                      {user.lastActiveAt
                        ? new Date(user.lastActiveAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>{user.invitationStatus}</td>
                    <td>
                      <div className="owner-filters">
                        <button
                          type="button"
                          className="owner-button owner-button--secondary"
                          onClick={() =>
                            setPending({
                              membershipId: user.membershipId,
                              action: "change_role",
                              role: roleDraft[user.membershipId] ?? user.role,
                              label: "Change organisation role?",
                              description: `Update ${user.fullName || user.email} to role ${(roleDraft[user.membershipId] ?? user.role)}.`,
                            })
                          }
                        >
                          Change role
                        </button>
                        {user.status === "deactivated" ? (
                          <button
                            type="button"
                            className="owner-button"
                            onClick={() =>
                              setPending({
                                membershipId: user.membershipId,
                                action: "reactivate",
                                label: "Reactivate account?",
                                description: `Reactivate ${user.fullName || user.email}.`,
                              })
                            }
                          >
                            Reactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="owner-button owner-button--danger"
                            onClick={() =>
                              setPending({
                                membershipId: user.membershipId,
                                action: "suspend",
                                label: "Suspend account?",
                                description: `Suspend ${user.fullName || user.email}.`,
                              })
                            }
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          type="button"
                          className="owner-button owner-button--secondary"
                          onClick={() =>
                            setPending({
                              membershipId: user.membershipId,
                              action: "password_reset",
                              label: "Initiate password reset?",
                              description:
                                "An email will be sent if the account has an email address. Passwords are never displayed.",
                            })
                          }
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="owner-button owner-button--secondary"
                          onClick={() =>
                            setPending({
                              membershipId: user.membershipId,
                              action: "resend_invitation",
                              label: "Resend invitation / access email?",
                              description:
                                "Sends an access email to the user if available.",
                            })
                          }
                        >
                          Resend invite
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="owner-stack" aria-label="User records">
            {users.map(user => (
              <article key={user.membershipId} className="owner-stack-card">
                <p className="owner-attention-item__title">
                  {user.fullName || user.email || "User"}
                </p>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Organisation</span>
                  <span>{user.organisationName}</span>
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Role</span>
                  <span>{user.role}</span>
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Status</span>
                  <OwnerStatus value={user.status} label={user.status} />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      <OwnerConfirmDialog
        open={Boolean(pending)}
        title={pending?.label ?? "Confirm"}
        description={pending?.description ?? ""}
        confirmLabel="Confirm"
        danger={pending?.action === "suspend"}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void runAction()}
      />
    </OwnerShell>
  );
}
