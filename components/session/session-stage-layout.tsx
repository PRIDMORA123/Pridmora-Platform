"use client";

import type { ReactNode } from "react";
import {
  SessionWorkspaceHeader,
  type SessionWorkspaceHeaderProps,
} from "@/components/session/session-workspace-header";
import { SessionWorkflowNavigation } from "@/components/session/session-workflow-navigation";
import { SessionErrorMessage } from "@/components/session/session-error-message";
import type {
  SessionStageAvailability,
  SessionWorkflowStage,
} from "@/lib/session/session-workflow";

export type SessionStageLayoutProps = {
  header: SessionWorkspaceHeaderProps;
  currentStage: SessionWorkflowStage;
  getAvailability: (stage: SessionWorkflowStage) => SessionStageAvailability;
  onNavigate: (stage: SessionWorkflowStage) => void;
  error?: string | null;
  errorDetail?: string | null;
  onRetryError?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function SessionStageLayout({
  header,
  currentStage,
  getAvailability,
  onNavigate,
  error,
  errorDetail,
  onRetryError,
  children,
  footer,
  className,
}: SessionStageLayoutProps) {
  return (
    <div
      className={["session-stage-layout", className].filter(Boolean).join(" ")}
    >
      <SessionWorkspaceHeader {...header} />

      <SessionWorkflowNavigation
        currentStage={currentStage}
        getAvailability={getAvailability}
        onNavigate={onNavigate}
      />

      {error ? (
        <SessionErrorMessage
          message={error}
          detail={errorDetail ?? undefined}
          onRetry={onRetryError}
        />
      ) : null}

      <div className="session-stage-layout__content">{children}</div>

      {footer ? (
        <footer className="session-stage-layout__footer">{footer}</footer>
      ) : null}
    </div>
  );
}
