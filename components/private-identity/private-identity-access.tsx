"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IdentityDrawer } from "@/components/identity/drawer";
import {
  mapPrivateIdentityLoadError,
  mapPrivateIdentitySaveError,
  PRIVATE_IDENTITY_MISSING,
  privateIdentityVisibleFields,
  type PrivateIdentityViewFields,
} from "@/lib/private-identity-ui";

type PrivateIdentityAccessProps = {
  clientId: string;
  confidentialReference?: string | null;
  /** When true, open the confirmation step (no fetch yet). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PanelMode = "view" | "edit";

/**
 * Coach-only private identity access.
 * Confirm → fetch → drawer. Clears payload on close, client change, and unmount.
 * Does not persist private values to storage or broad app state.
 */
export function PrivateIdentityAccess({
  clientId,
  confidentialReference,
  open,
  onOpenChange,
}: PrivateIdentityAccessProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>("view");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<PrivateIdentityViewFields | null>(null);
  const [draft, setDraft] = useState({
    realName: "",
    email: "",
    phone: "",
    privateNotes: "",
  });
  const previousClientIdRef = useRef(clientId);

  const clearPrivateState = useCallback(() => {
    setConfirmOpen(false);
    setPanelOpen(false);
    setMode("view");
    setLoading(false);
    setSaving(false);
    setError("");
    setRecord(null);
    setDraft({ realName: "", email: "", phone: "", privateNotes: "" });
  }, []);

  const closeAll = useCallback(() => {
    clearPrivateState();
    onOpenChange(false);
  }, [clearPrivateState, onOpenChange]);

  // Parent requests open → confirmation only (no fetch yet).
  useEffect(() => {
    if (!open) {
      clearPrivateState();
      return;
    }
    setConfirmOpen(true);
    setPanelOpen(false);
    setMode("view");
    setError("");
    setRecord(null);
    setDraft({ realName: "", email: "", phone: "", privateNotes: "" });
  }, [open, clearPrivateState]);

  // Clear immediately when navigating to another relationship.
  useEffect(() => {
    if (previousClientIdRef.current === clientId) return;
    previousClientIdRef.current = clientId;
    clearPrivateState();
    onOpenChange(false);
  }, [clientId, clearPrivateState, onOpenChange]);

  // Clear on unmount / navigation away.
  useEffect(() => {
    return () => {
      setRecord(null);
      setDraft({ realName: "", email: "", phone: "", privateNotes: "" });
      setError("");
    };
  }, []);

  async function loadAfterConfirm() {
    if (!clientId || loading) return;
    setLoading(true);
    setError("");
    setConfirmOpen(false);
    try {
      const data = await apiJson<{
        privateIdentity: PrivateIdentityViewFields | null;
      }>(`/api/clients/${encodeURIComponent(clientId)}/private-identity`, {
        method: "GET",
        operation: "private_identity_view",
        relationshipId: clientId,
      });
      setRecord(data.privateIdentity);
      setDraft({
        realName: data.privateIdentity?.realName || "",
        email: data.privateIdentity?.email || "",
        phone: data.privateIdentity?.phone || "",
        privateNotes: data.privateIdentity?.privateNotes || "",
      });
      setMode("view");
      setPanelOpen(true);
    } catch (err) {
      setRecord(null);
      setError(mapPrivateIdentityLoadError(err));
      setPanelOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function savePrivateIdentity() {
    if (!clientId || saving) return;
    setSaving(true);
    setError("");
    try {
      const data = await apiJson<{
        privateIdentity: PrivateIdentityViewFields;
      }>(`/api/clients/${encodeURIComponent(clientId)}/private-identity`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: draft.realName,
          email: draft.email,
          phone: draft.phone,
          privateNotes: draft.privateNotes,
        }),
        operation: "private_identity_update",
        relationshipId: clientId,
      });
      setRecord(data.privateIdentity);
      setDraft({
        realName: data.privateIdentity.realName || "",
        email: data.privateIdentity.email || "",
        phone: data.privateIdentity.phone || "",
        privateNotes: data.privateIdentity.privateNotes || "",
      });
      setMode("view");
    } catch (err) {
      setError(mapPrivateIdentitySaveError(err));
    } finally {
      setSaving(false);
    }
  }

  const visible = privateIdentityVisibleFields(record, confidentialReference);
  const denied = Boolean(error) && !record;
  const canEdit = !denied;

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="View private identity"
        closeDisabled={loading}
        onClose={() => {
          if (!loading) closeAll();
        }}
        footer={
          <>
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={closeAll}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={loading}
              aria-busy={loading}
              onClick={() => {
                void loadAfterConfirm();
              }}
            >
              {loading ? "Loading…" : "View identity"}
            </button>
          </>
        }
      >
        <p>This information is protected. Access is recorded for audit purposes.</p>
      </ConfirmDialog>

      <IdentityDrawer
        open={panelOpen}
        title="Private identity"
        closeAriaLabel="Close private identity"
        onClose={closeAll}
        footer={
          mode === "edit" ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => {
                  setMode("view");
                  setError("");
                  setDraft({
                    realName: record?.realName || "",
                    email: record?.email || "",
                    phone: record?.phone || "",
                    privateNotes: record?.privateNotes || "",
                  });
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={saving}
                aria-busy={saving}
                onClick={() => {
                  void savePrivateIdentity();
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" onClick={closeAll}>
                Close
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setMode("edit");
                    setError("");
                  }}
                >
                  Edit private identity
                </button>
              ) : null}
            </>
          )
        }
      >
        {mode === "view" ? (
          <>
            {denied ? (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            ) : visible.length === 0 ||
              visible.every(field => field.label === "Confidential reference") ? (
              <>
                {visible.length > 0 ? (
                  <dl className="client-identity-private-fields">
                    {visible.map(field => (
                      <div key={field.label}>
                        <dt>{field.label}</dt>
                        <dd>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <p className="client-identity-private-empty">
                  {PRIVATE_IDENTITY_MISSING}
                </p>
              </>
            ) : (
              <dl className="client-identity-private-fields">
                {visible.map(field => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <form
            className="private-identity-edit-form"
            onSubmit={event => {
              event.preventDefault();
              void savePrivateIdentity();
            }}
          >
            {error ? (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            ) : null}
            <label>
              Name
              <input
                type="text"
                autoComplete="off"
                value={draft.realName}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    realName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                autoComplete="off"
                value={draft.phone}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Private note
              <textarea
                rows={4}
                value={draft.privateNotes}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    privateNotes: event.target.value,
                  }))
                }
              />
            </label>
          </form>
        )}
      </IdentityDrawer>
    </>
  );
}
