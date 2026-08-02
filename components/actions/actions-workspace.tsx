"use client";

import { useMemo, useState } from "react";
import type { ActionStatus, CoachingAction } from "@/lib/types";
import { CommitmentCard } from "@/components/actions/commitment-card";
import { ActionButton } from "@/components/feedback/action-button";
import { SaveStatus } from "@/components/feedback/save-status";
import { EmergingEvidenceState } from "@/components/journey/emerging-evidence-state";
import { PageSectionHeading } from "@/components/layout/page-section-heading";
import { Modal } from "@/components/ui/modal";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { IDENTITY_EMPTY_STATES } from "@/lib/identity-empty-states";
import { toActionButtonStatus } from "@/types/action-feedback";
import type { ClientAction } from "@/types/client-action";
import "@/components/edit-client-dialog.css";
import "@/app/workspace-refinement.css";

function toClientAction(action: CoachingAction): ClientAction {
  return {
    id: action.id,
    title: action.title,
    ownerName: action.owner?.trim() || "Unassigned",
    dueDate: action.due || null,
    notes: action.notes || null,
    status: action.status === "Complete" ? "completed" : "open",
  };
}

type ActionFormState = {
  title: string;
  owner: string;
  due: string;
  status: ActionStatus;
  notes: string;
};

const EMPTY_FORM = (owner: string): ActionFormState => ({
  title: "",
  owner,
  due: "",
  status: "Open",
  notes: "",
});

export function ActionsWorkspace({
  clientName,
  clientId,
  sessionId,
  actions,
  readOnly = false,
  onSaveAction,
  completionSlot,
  embedded = false,
}: {
  clientName: string;
  clientId: string;
  sessionId: string;
  actions: CoachingAction[];
  readOnly?: boolean;
  onSaveAction: (action: CoachingAction & { clientId: string }) => Promise<CoachingAction>;
  completionSlot?: React.ReactNode;
  /** When true, share the parent workspace spine (no separate page width). */
  embedded?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => EMPTY_FORM(clientName));
  const [historyOpen, setHistoryOpen] = useState(false);
  const { feedback, isLoading, runAction } = useActionFeedback();

  const clientActions = useMemo(
    () => actions.map(toClientAction),
    [actions]
  );

  const openActions = clientActions.filter(action => action.status === "open");
  const completedActions = clientActions.filter(
    action => action.status === "completed"
  );

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM(clientName));
    setModalOpen(true);
  }

  function openEditModal(action: ClientAction) {
    setEditingId(action.id);
    setForm({
      title: action.title,
      owner: action.ownerName,
      due: action.dueDate || "",
      status: action.status === "completed" ? "Complete" : "Open",
      notes: action.notes || "",
    });
    setModalOpen(true);
  }

  async function persistAction(next: CoachingAction & { clientId: string }) {
    return runAction(() => onSaveAction(next), {
      loadingMessage: editingId ? "Saving…" : "Adding…",
      successMessage: editingId ? "Commitment updated" : "Commitment added",
      errorMessage: "Unable to save commitment",
    });
  }

  async function handleSubmit() {
    if (!form.title.trim() || isLoading) return;

    const base = actions.find(item => item.id === editingId);
    const saved = await persistAction({
      id: editingId || crypto.randomUUID(),
      title: form.title.trim(),
      owner: form.owner.trim() || clientName,
      due: form.due.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
      clientId,
      sessionId: base?.sessionId ?? sessionId,
    });

    if (saved) {
      setModalOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM(clientName));
    }
  }

  async function handleComplete(id: string) {
    const existing = actions.find(item => item.id === id);
    if (!existing) return;
    await runAction(
      () =>
        onSaveAction({
          ...existing,
          clientId,
          status: "Complete",
        }),
      {
        loadingMessage: "Updating…",
        successMessage: "Commitment completed",
        errorMessage: "Unable to complete commitment",
      }
    );
  }

  async function handleReopen(id: string) {
    const existing = actions.find(item => item.id === id);
    if (!existing) return;
    await runAction(
      () =>
        onSaveAction({
          ...existing,
          clientId,
          status: "Open",
        }),
      {
        loadingMessage: "Updating…",
        successMessage: "Commitment reopened",
        errorMessage: "Unable to reopen commitment",
      }
    );
  }

  const addCommitmentButton = (
    <ActionButton
      idleLabel="Add commitment"
      loadingLabel="Adding…"
      successLabel="Commitment added"
      errorLabel="Try again"
      status={modalOpen ? toActionButtonStatus(feedback.status) : "idle"}
      onClick={openCreateModal}
      disabled={readOnly || isLoading}
    />
  );

  return (
    <main
      className={
        embedded
          ? "actions-workspace-page actions-workspace-page--embedded"
          : "actions-workspace-page"
      }
    >
      <div className="actions-workspace-header">
        {embedded ? (
          <header className="identity-actions-header">
            <div className="identity-actions-header__copy">
              <p className="identity-actions-header__eyebrow">Commitments</p>
              <h2 className="identity-actions-header__title">Actions</h2>
              <p className="identity-actions-header__description">
                Track what was agreed and what still needs attention.
              </p>
            </div>
            {addCommitmentButton}
          </header>
        ) : (
          <PageSectionHeading
            eyebrow="Commitments"
            title="Actions"
            description="Track what was agreed and what still needs attention."
            actions={addCommitmentButton}
          />
        )}
      </div>

      <div className="actions-workspace-section">
        <div className="actions-workspace-section__heading">
          <h2>Open commitments</h2>
          <SaveStatus feedback={feedback} />
        </div>

        {openActions.length === 0 ? (
          <EmergingEvidenceState
            title={IDENTITY_EMPTY_STATES.noCommitments.title}
            description={IDENTITY_EMPTY_STATES.noCommitments.description}
          />
        ) : (
          <div className="actions-workspace-list">
            {openActions.map(action => (
              <CommitmentCard
                key={action.id}
                action={action}
                disabled={readOnly || isLoading}
                onComplete={id => void handleComplete(id)}
                onReopen={id => void handleReopen(id)}
                onEdit={openEditModal}
              />
            ))}
          </div>
        )}
      </div>

      <div className="actions-workspace-section">
        <div className="actions-workspace-section__heading">
          <h2>Completed commitments</h2>
          <button
            type="button"
            className="identity-text-action"
            onClick={() => setHistoryOpen(current => !current)}
            aria-expanded={historyOpen}
          >
            {historyOpen ? "Hide history" : "Show history"}
          </button>
        </div>

        {historyOpen ? (
          completedActions.length === 0 ? (
            <p className="identity-empty-copy">No completed commitments yet.</p>
          ) : (
            <div className="actions-workspace-list">
              {completedActions.map(action => (
                <CommitmentCard
                  key={action.id}
                  action={action}
                  disabled={readOnly || isLoading}
                  onComplete={id => void handleComplete(id)}
                  onReopen={id => void handleReopen(id)}
                  onEdit={openEditModal}
                />
              ))}
            </div>
          )
        ) : (
          <p className="identity-empty-copy">
            {completedActions.length} completed
            {completedActions.length === 1 ? " commitment" : " commitments"}{" "}
            in history.
          </p>
        )}
      </div>

      {completionSlot}

      <Modal
        isOpen={modalOpen}
        title={editingId ? "Edit commitment" : "Add commitment"}
        eyebrow="Commitments"
        onClose={() => {
          if (!isLoading) setModalOpen(false);
        }}
        closeDisabled={isLoading}
        size="md"
        footer={
          <>
            <ActionButton
              variant="secondary"
              idleLabel="Cancel"
              onClick={() => setModalOpen(false)}
              disabled={isLoading}
            />
            <ActionButton
              status={toActionButtonStatus(feedback.status)}
              idleLabel={editingId ? "Save commitment" : "Add commitment"}
              loadingLabel={editingId ? "Saving…" : "Adding…"}
              successLabel={
                editingId ? "Commitment updated" : "Commitment added"
              }
              errorLabel="Try again"
              onClick={() => void handleSubmit()}
              disabled={readOnly || isLoading || !form.title.trim()}
            />
          </>
        }
      >
        <div className="edit-client-form-grid">
          <label className="edit-client-field edit-client-field--full">
            <span>Action</span>
            <input
              type="text"
              value={form.title}
              disabled={readOnly || isLoading}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label className="edit-client-field">
            <span>Owner</span>
            <input
              type="text"
              value={form.owner}
              disabled={readOnly || isLoading}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  owner: event.target.value,
                }))
              }
            />
          </label>
          <label className="edit-client-field">
            <span>Due date</span>
            <input
              type="date"
              value={form.due}
              disabled={readOnly || isLoading}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  due: event.target.value,
                }))
              }
            />
          </label>
          <label className="edit-client-field edit-client-field--full">
            <span>Status</span>
            <select
              value={form.status}
              disabled={readOnly || isLoading}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  status: event.target.value as ActionStatus,
                }))
              }
            >
              <option value="Open">Open</option>
              <option value="In progress">In progress</option>
              <option value="Complete">Complete</option>
            </select>
          </label>
          <label className="edit-client-field edit-client-field--full">
            <span>Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              disabled={readOnly || isLoading}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>
      </Modal>
    </main>
  );
}
