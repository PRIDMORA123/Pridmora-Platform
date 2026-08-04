"use client";

import { useEffect, useState } from "react";
import type { CoachProfile } from "@/lib/auth/types";
import { apiJson, AuthRequiredError, errorMessage } from "@/lib/api-client";
import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import {
  parseCoachingIntelligenceMode,
  preparationStyleToMode,
} from "@/lib/coaching-intelligence/mode";
import { IdentityButton, IdentityPageHeader } from "@/components/identity";
import { BRAND } from "@/lib/brand";
import { identityMessages } from "@/lib/identity-language";
import { useCanManageSampleOrganisation } from "@/lib/organisations/use-can-manage-sample-organisation";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";

export function SettingsView({
  profile,
  onProfileUpdated,
}: {
  profile: CoachProfile & { email?: string | null };
  onProfileUpdated?: (profile: CoachProfile & { email?: string | null }) => void;
}) {
  const showSampleOrganisation = useCanManageSampleOrganisation();
  const [intelligenceMode, setIntelligenceMode] =
    useState<CoachingIntelligenceMode>(() =>
      parseCoachingIntelligenceMode(
        profile.coachingIntelligenceMode,
        preparationStyleToMode(profile.preparationStyle ?? "guided")
      )
    );
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIntelligenceMode(
      parseCoachingIntelligenceMode(
        profile.coachingIntelligenceMode,
        preparationStyleToMode(profile.preparationStyle ?? "guided")
      )
    );
  }, [profile.coachingIntelligenceMode, profile.preparationStyle]);

  async function saveIntelligencePreference() {
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const data = await apiJson<{
        profile: CoachProfile & { email?: string | null };
        message?: string;
      }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachingIntelligenceMode: intelligenceMode }),
      });
      onProfileUpdated?.(data.profile);
      setFlash(data.message || identityMessages.preferenceSaved);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        window.location.assign("/auth/sign-in?next=/?view=settings");
        return;
      }
      setError(
        errorMessage(
          err,
          "Your changes could not be saved. Please try again before leaving this page."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page identity-reveal">
      <IdentityPageHeader
        eyebrow="Account"
        title="Settings"
        description={`Preferences for how the ${BRAND.productShortName} supports your coaching practice.`}
      />

      {flash ? (
        <div className="inline-success" role="status">
          <p>{flash}</p>
        </div>
      ) : null}
      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <article className="panel">
        <h2>Profile</h2>
        <dl className="meta-list">
          <div>
            <dt>Name</dt>
            <dd>{profile.fullName || "Not set"}</dd>
          </div>
          <div>
            <dt>Professional title</dt>
            <dd>{profile.professionalTitle || "Not set"}</dd>
          </div>
          <div>
            <dt>Organisation</dt>
            <dd>{profile.organisation || "Not set"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile.email || "Not set"}</dd>
          </div>
        </dl>
      </article>

      <article className="panel coaching-intelligence-settings" style={{ marginTop: 22 }}>
        <h2>Professional Coaching Intelligence™</h2>
        <p>Default support level for new preparation work</p>

        <div
          className="prep-style-options"
          role="radiogroup"
          aria-label="Coaching intelligence support level"
        >
          {(
            ["manual", "assisted", "comprehensive"] as CoachingIntelligenceMode[]
          ).map(mode => {
            const option = COACHING_INTELLIGENCE_MODES[mode];
            const selected = intelligenceMode === mode;
            return (
              <label
                key={mode}
                className={`prep-style-option${selected ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="coaching-intelligence-mode"
                  value={mode}
                  checked={selected}
                  onChange={() => setIntelligenceMode(mode)}
                />
                <span className="prep-style-option-body">
                  <span className="prep-style-option-title">
                    {option.label}
                    {mode === "assisted" ? (
                      <span className="prep-style-recommended">Recommended</span>
                    ) : null}
                  </span>
                  <span className="prep-style-option-copy">
                    {option.fullDescription}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <ul className="coaching-intelligence-settings__notes">
          <li>You can also change this level on each Prepare page.</li>
          <li>Manual stops AI generation for preparation.</li>
          <li>Existing approved coaching records are not deleted.</li>
          <li>
            Changing level does not automatically regenerate existing
            preparation.
          </li>
          <li>AI never approves content — you remain responsible for judgement.</li>
        </ul>

        <div className="button-row" style={{ marginTop: 22 }}>
          <IdentityButton
            variant="primary"
            disabled={saving}
            onClick={() => void saveIntelligencePreference()}
          >
            {saving ? "Saving…" : "Save preference"}
          </IdentityButton>
        </div>
      </article>

      {showSampleOrganisation ? (
        <article className="panel" style={{ marginTop: 22 }}>
          <h2>Sample organisation</h2>
          <p className="muted">
            Install a fictional coaching environment for demonstrations, training and
            evaluation.
          </p>
          <p style={{ marginTop: 12 }}>
            <a className="organisation-text-link" href="/settings/sample-organisation">
              Open Sample organisation
            </a>
          </p>
        </article>
      ) : null}

      <article className="panel" style={{ marginTop: 22 }}>
        <h2>Privacy and trust</h2>
        <p className="muted">
          Coaching information is private to your account. Proposed interpretations remain
          proposed until you approve them. The platform does not claim to know, assess or
          diagnose people.
        </p>
      </article>
    </section>
  );
}
