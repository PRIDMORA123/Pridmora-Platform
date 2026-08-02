"use client";

import type { PropsWithChildren } from "react";
import { ToastProvider } from "@/components/feedback/toast-provider";

export function AppProviders({ children }: PropsWithChildren) {
  return <ToastProvider>{children}</ToastProvider>;
}
