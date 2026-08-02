import type { ReactNode } from "react";
import { IdentityPathMark } from "@/components/identity/path-mark";

type IdentityAsyncStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "neutral" | "warning" | "error";
};

export function IdentityAsyncState({
  title,
  description,
  action,
  tone = "neutral",
}: IdentityAsyncStateProps) {
  return (
    <section className={`identity-async-state is-${tone}`}>
      <IdentityPathMark size={30} />

      <div>
        <h2 className="identity-subheading">{title}</h2>
        <p>{description}</p>
      </div>

      {action ? <div>{action}</div> : null}
    </section>
  );
}
