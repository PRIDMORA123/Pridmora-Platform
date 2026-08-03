"use client";

import type { FormEvent, ReactNode } from "react";
import { Modal } from "@/components/ui/modal";

export function ConfirmDialog({
  open,
  title,
  children,
  onClose,
  footer,
  danger = false,
  closeDisabled = false,
  onSubmit,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  danger?: boolean;
  closeDisabled?: boolean;
  /** When set, the dialog shell is a <form> and submits call this handler. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      isOpen={open}
      title={title}
      onClose={onClose}
      footer={footer}
      danger={danger}
      size="md"
      closeDisabled={closeDisabled}
      onSubmit={onSubmit}
    >
      {children}
    </Modal>
  );
}
