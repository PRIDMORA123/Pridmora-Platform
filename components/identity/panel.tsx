import type { ReactNode } from "react";

export function IdentityPanel({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: "default" | "soft" | "highlight";
  className?: string;
}) {
  return (
    <div className={`identity-panel is-${tone} ${className}`.trim()}>
      {children}
    </div>
  );
}
