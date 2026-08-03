import type { ReactNode } from "react";

export type PremiumInlineNoticeTone =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "neutral";

export function PremiumInlineNotice({
  children,
  tone = "info",
  role,
  className = "",
}: {
  children: ReactNode;
  tone?: PremiumInlineNoticeTone;
  role?: "status" | "alert";
  className?: string;
}) {
  const resolvedRole =
    role ?? (tone === "error" || tone === "warning" ? "alert" : "status");

  return (
    <div
      className={`premium-inline-notice identity-notice is-${tone === "info" ? "information" : tone} ${className}`.trim()}
      role={resolvedRole}
      aria-live={resolvedRole === "alert" ? "assertive" : "polite"}
    >
      {children}
    </div>
  );
}
