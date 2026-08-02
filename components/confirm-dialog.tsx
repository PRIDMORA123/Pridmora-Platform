"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/modal";

export function ConfirmDialog({
  open,
  title,
  children,
  onClose,
  footer,
  danger = false,
  closeDisabled = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  danger?: boolean;
  closeDisabled?: boolean;
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
    >
      {children}
    </Modal>
  );
}
