"use client";

import type { SessionModuleStatus } from "@/lib/relationship-workspace";

export type SessionModuleTileProps = {
  title: string;
  description: string;
  status: SessionModuleStatus;
  statusLabel: string;
  actionLabel: string;
  href?: string;
  onClick?: () => void;
  intelligence?: boolean;
  current?: boolean;
  unavailableReason?: string;
};

export function SessionModuleTile({
  title,
  description,
  status,
  statusLabel,
  actionLabel,
  href,
  onClick,
  intelligence = false,
  current = false,
  unavailableReason,
}: SessionModuleTileProps) {
  const unavailable = status === "unavailable" || (!onClick && !href);
  const className = [
    "session-module-tile",
    intelligence ? "session-module-tile--intelligence" : "",
    current ? "session-module-tile--current" : "",
    unavailable ? "session-module-tile--unavailable" : "",
    `session-module-tile--${status}`,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="session-module-tile__header">
        <h3 className="session-module-tile__title">{title}</h3>
        <span
          className="session-module-tile__status"
          data-status={status}
        >
          {statusLabel}
        </span>
      </div>
      <p className="session-module-tile__description">{description}</p>
      {!unavailable ? (
        <span className="session-module-tile__action">{actionLabel}</span>
      ) : (
        <span className="session-module-tile__unavailable-reason">
          {unavailableReason || "Not available yet."}
        </span>
      )}
    </>
  );

  if (unavailable) {
    return (
      <div
        className={className}
        aria-disabled="true"
        title={unavailableReason}
      >
        {content}
      </div>
    );
  }

  if (href) {
    return (
      <a
        className={className}
        href={href}
        aria-current={current ? "step" : undefined}
        onClick={
          onClick
            ? event => {
                event.preventDefault();
                onClick();
              }
            : undefined
        }
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-current={current ? "step" : undefined}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
