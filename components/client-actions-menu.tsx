"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  MoreHorizontal,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  MessageCircle,
  Lock,
} from "lucide-react";
import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeleteClientDialog } from "@/components/delete-client-dialog";
import { PrivateIdentityAccess } from "@/components/private-identity/private-identity-access";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

const POPOVER_WIDTH = 220;
const POPOVER_GAP = 8;
const VIEWPORT_GUTTER = 12;

function getPopoverPosition(rect: DOMRect) {
  const preferredLeft = rect.right - POPOVER_WIDTH;

  const left = Math.min(
    Math.max(VIEWPORT_GUTTER, preferredLeft),
    window.innerWidth - POPOVER_WIDTH - VIEWPORT_GUTTER
  );

  const top = Math.min(
    rect.bottom + POPOVER_GAP,
    window.innerHeight - 120
  );

  return { top, left };
}

function ClientActionsPopover({
  menuId,
  position,
  archived,
  submitting,
  showPrivateIdentity,
  onViewPrivateIdentity,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  allowPermanentDelete,
  onNewCoachingMoment,
  labels,
  popoverRef,
}: {
  menuId: string;
  position: { top: number; left: number };
  archived: boolean;
  submitting: boolean;
  showPrivateIdentity: boolean;
  onViewPrivateIdentity: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  allowPermanentDelete: boolean;
  onNewCoachingMoment?: () => void;
  labels: {
    newMomentLabel: string;
    editPersonLabel: string;
    archivePersonLabel: string;
    restorePersonLabel: string;
    deletePersonLabel: string;
  };
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={popoverRef}
      id={menuId}
      className="client-actions-popover"
      role="menu"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {onNewCoachingMoment && !archived ? (
        <button
          type="button"
          role="menuitem"
          className="client-actions-item"
          onClick={onNewCoachingMoment}
        >
          <MessageCircle size={15} aria-hidden="true" /> {labels.newMomentLabel}
        </button>
      ) : null}
      {showPrivateIdentity ? (
        <button
          type="button"
          role="menuitem"
          className="client-actions-item"
          onClick={onViewPrivateIdentity}
        >
          <Lock size={15} aria-hidden="true" /> View private identity
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="client-actions-item"
        onClick={onEdit}
      >
        <Pencil size={15} aria-hidden="true" /> {labels.editPersonLabel}
      </button>
      {archived ? (
        <button
          type="button"
          role="menuitem"
          className="client-actions-item"
          disabled={submitting}
          onClick={onRestore}
        >
          <RotateCcw size={15} aria-hidden="true" /> {labels.restorePersonLabel}
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="client-actions-item"
          onClick={onArchive}
        >
          <Archive size={15} aria-hidden="true" /> {labels.archivePersonLabel}
        </button>
      )}
      {allowPermanentDelete ? (
        <button
          type="button"
          role="menuitem"
          className="client-actions-item client-actions-item--danger"
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" /> {labels.deletePersonLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ClientActionsMenu({
  client,
  busy = false,
  onEdit,
  onArchive,
  onRestore,
  onPermanentlyDelete,
  allowPermanentDelete = true,
  onNewCoachingMoment,
}: {
  client: Client;
  busy?: boolean;
  onEdit: () => void;
  onArchive: () => Promise<void> | void;
  onRestore: () => Promise<void> | void;
  onPermanentlyDelete?: () => Promise<void> | void;
  /** When false (e.g. Manager pilot), hide permanent delete; archive/restore remain. */
  allowPermanentDelete?: boolean;
  onNewCoachingMoment?: () => void;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const canPermanentlyDelete =
    allowPermanentDelete && typeof onPermanentlyDelete === "function";
  const archived = isClientArchived(client);
  const isConfidential = client.identityMode === "confidential";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [privateIdentityOpen, setPrivateIdentityOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPrivateIdentityOpen(false);
  }, [client.id]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(getPopoverPosition(rect));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    }

    function onReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, closeMenu, updatePosition]);

  async function runAction(action: () => Promise<void> | void, close: () => void) {
    setActionError("");
    setSubmitting(true);
    try {
      await action();
      close();
      setOpen(false);
    } catch (error) {
      console.error("Client action failed", error);
      setActionError("Unable to complete this action. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="client-actions">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button ghost-icon-button"
        aria-label={language.personActionsAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={busy || submitting}
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          updatePosition();
          setOpen(true);
        }}
      >
        <MoreHorizontal size={18} />
      </button>

      {open && mounted
        ? createPortal(
            <ClientActionsPopover
              menuId={menuId}
              position={position}
              archived={archived}
              submitting={submitting}
              showPrivateIdentity={isConfidential}
              popoverRef={popoverRef}
              onViewPrivateIdentity={() => {
                closeMenu();
                setPrivateIdentityOpen(true);
              }}
              onNewCoachingMoment={
                onNewCoachingMoment
                  ? () => {
                      closeMenu();
                      onNewCoachingMoment();
                    }
                  : undefined
              }
              onEdit={() => {
                closeMenu();
                onEdit();
              }}
              onArchive={() => {
                closeMenu();
                setActionError("");
                setArchiveOpen(true);
              }}
              onRestore={() => {
                closeMenu();
                void runAction(onRestore, () => undefined);
              }}
              allowPermanentDelete={canPermanentlyDelete}
              labels={{
                newMomentLabel: language.newMomentLabel,
                editPersonLabel: language.editPersonLabel,
                archivePersonLabel: language.archivePersonLabel,
                restorePersonLabel: language.restorePersonLabel,
                deletePersonLabel: language.deletePersonLabel,
              }}
              onDelete={() => {
                if (!canPermanentlyDelete) return;
                closeMenu();
                setActionError("");
                setDeleteOpen(true);
              }}
            />,
            document.body
          )
        : null}

      {isConfidential ? (
        <PrivateIdentityAccess
          clientId={client.id}
          confidentialReference={client.confidentialReference}
          open={privateIdentityOpen}
          onOpenChange={setPrivateIdentityOpen}
        />
      ) : null}

      {actionError && !archiveOpen && !deleteOpen ? (
        <div className="inline-error client-actions-error" role="alert">
          <p>{actionError}</p>
        </div>
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        title={language.archivePersonConfirmTitle}
        closeDisabled={submitting}
        onClose={() => {
          if (!submitting) setArchiveOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={() => setArchiveOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={submitting}
              aria-busy={submitting}
              onClick={() => {
                void runAction(onArchive, () => setArchiveOpen(false));
              }}
            >
              {submitting ? "Archiving..." : language.archivePersonLabel}
            </button>
          </>
        }
      >
        <p>
          {language.archivePersonConfirmBody}
        </p>
        {actionError ? (
          <p className="dialog-error" role="alert">
            {actionError}
          </p>
        ) : null}
      </ConfirmDialog>

      {canPermanentlyDelete ? (
        <DeleteClientDialog
          isOpen={deleteOpen}
          clientName={getRelationshipDisplayName(client)}
          isDeleting={submitting || busy}
          errorMessage={actionError}
          onClose={() => {
            if (!submitting) setDeleteOpen(false);
          }}
          onConfirm={() =>
            runAction(onPermanentlyDelete!, () => setDeleteOpen(false))
          }
        />
      ) : null}
    </div>
  );
}
