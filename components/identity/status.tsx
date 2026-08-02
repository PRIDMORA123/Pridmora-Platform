import type { ReactNode } from "react";

export function IdentityStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "attention" | "info";
}) {
  return <span className={`identity-status is-${tone}`}>{children}</span>;
}
