"use client";

import type { PropsWithChildren } from "react";
import { RecoverySessionBridge } from "@/components/auth/recovery-session-bridge";
import { ToastProvider } from "@/components/feedback/toast-provider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ToastProvider>
      <RecoverySessionBridge />
      {children}
    </ToastProvider>
  );
}
