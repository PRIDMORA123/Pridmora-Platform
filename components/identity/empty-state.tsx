import type { ReactNode } from "react";
import { IdentityPathMark } from "@/components/identity/path-mark";

export function IdentityEmptyState({
  title,
  description,
  action,
  showMark = true,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  showMark?: boolean;
}) {
  return (
    <div className="identity-empty-state">
      {showMark ? <IdentityPathMark size={30} /> : null}

      <h3 className="identity-subheading">{title}</h3>
      <p>{description}</p>

      {action ? <div>{action}</div> : null}
    </div>
  );
}
