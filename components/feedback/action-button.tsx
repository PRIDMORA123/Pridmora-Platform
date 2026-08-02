"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ActionButtonStatus } from "@/types/action-feedback";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  status?: ActionButtonStatus;
  idleLabel: ReactNode;
  loadingLabel?: ReactNode;
  successLabel?: ReactNode;
  errorLabel?: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
};

export function ActionButton({
  status = "idle",
  idleLabel,
  loadingLabel = "Working…",
  successLabel = "Saved",
  errorLabel = "Try again",
  variant = "primary",
  disabled,
  className = "",
  ...buttonProps
}: ActionButtonProps) {
  const isLoading = status === "loading";

  const content = {
    idle: idleLabel,
    loading: (
      <>
        <span className="action-button-spinner" aria-hidden="true" />
        <span>{loadingLabel}</span>
      </>
    ),
    success: (
      <>
        <span className="action-button-check" aria-hidden="true">
          ✓
        </span>
        <span>{successLabel}</span>
      </>
    ),
    error: errorLabel,
  }[status];

  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      className={[
        "identity-action-button",
        `identity-action-button--${variant}`,
        `is-${status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      {content}
    </button>
  );
}
