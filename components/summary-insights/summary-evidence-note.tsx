import type { ReactNode } from "react";

export type SummaryEvidenceNoteProps = {
  children: ReactNode;
};

export function SummaryEvidenceNote({ children }: SummaryEvidenceNoteProps) {
  return <aside className="summary-evidence-note">{children}</aside>;
}
