import type { ReactNode } from "react";

export function IdentityIntelligenceActions({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="identity-intelligence__actions">{children}</div>;
}
