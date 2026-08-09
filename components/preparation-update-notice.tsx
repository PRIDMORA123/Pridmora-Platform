"use client";

import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

export type PreparationUpdateNoticeProps = {
  lastUpdated: string;
  needsUpdate: boolean;
  onUpdate: () => void;
  updating?: boolean;
  disabled?: boolean;
  updateReason?: "stale" | "style-changed";
};

export function PreparationUpdateNotice({
  lastUpdated,
  needsUpdate,
  onUpdate,
  updating = false,
  disabled = false,
  updateReason = "stale",
}: PreparationUpdateNoticeProps) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const title =
    updateReason === "style-changed"
      ? "Your preparation approach has changed."
      : `Your ${language.personSingular}’s development information has changed since this brief was created.`;

  const supporting =
    updateReason === "style-changed"
      ? "The current brief will stay as it is until you choose to update it."
      : "Update the brief when you are ready to include the latest approved information.";

  return (
    <section
      className={`preparation-update-notice${needsUpdate ? " needs-update identity-notice is-information" : ""}`}
    >
      {needsUpdate ? (
        <>
          <div className="preparation-update-notice-copy">
            <h2>{title}</h2>
            <p>{supporting}</p>
          </div>

          <button
            type="button"
            className="identity-button is-secondary is-md"
            onClick={onUpdate}
            disabled={disabled || updating}
          >
            {updating ? "Updating…" : "Update Preparation Brief"}
          </button>
        </>
      ) : (
        <p className="preparation-current-status">
          This preparation brief includes the latest approved development
          information.
        </p>
      )}

      {lastUpdated ? (
        <p className="preparation-last-updated">Last updated: {lastUpdated}</p>
      ) : null}
    </section>
  );
}
