"use client";

import { MessageCircle } from "lucide-react";

export type CoachingMomentLauncherProps = {
  disabled?: boolean;
  variant?: "button" | "menu-item" | "quiet";
  onLaunch: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
};

/**
 * Secondary action to begin a Coaching Moment.
 * Must never outrank an unfinished formal coaching session.
 */
export function CoachingMomentLauncher({
  disabled = false,
  variant = "button",
  onLaunch,
  buttonRef,
}: CoachingMomentLauncherProps) {
  if (variant === "menu-item") {
    return (
      <button
        ref={buttonRef}
        type="button"
        role="menuitem"
        className="client-actions-item"
        disabled={disabled}
        onClick={onLaunch}
      >
        <MessageCircle size={15} aria-hidden="true" /> New Coaching Moment
      </button>
    );
  }

  const className =
    variant === "quiet"
      ? "identity-button is-quiet coaching-moment-launcher"
      : "identity-button is-secondary coaching-moment-launcher";

  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      disabled={disabled}
      onClick={onLaunch}
    >
      New Coaching Moment
    </button>
  );
}
