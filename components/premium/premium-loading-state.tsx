import type { ReactNode } from "react";
import { IdentityAsyncState } from "@/components/identity/async-state";

export function PremiumLoadingState({
  title = "Loading",
  description = "Please wait a moment.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <IdentityAsyncState
      title={title}
      description={description}
      action={action}
      tone="neutral"
    />
  );
}
