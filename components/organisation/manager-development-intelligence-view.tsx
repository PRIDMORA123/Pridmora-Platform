"use client";

import Link from "next/link";
import type { ManagerDevelopmentIntelligenceView } from "@/lib/manager-development-intelligence";
import {
  LEAD_LENS_SEPARATION_COPY,
  LEAD_MANAGER_DI_INTERPRETATION_COPY,
  LEAD_OVERVIEW_LENS_NOTE,
  LEAD_PRIVACY_BOUNDARY_COPY,
  STRENGTH_EXPLANATIONS,
  strengthDisplayLabel,
  themeDescriptionForKey,
} from "@/lib/manager-development-intelligence/ui-copy";

export type ManagerDevelopmentLeadPayload = ManagerDevelopmentIntelligenceView;

export function ManagerDevelopmentIntelligenceView({
  data,
  variant = "full",
}: {
  data: ManagerDevelopmentLeadPayload;
  variant?: "full" | "overview";
}) {
  const isOverview = variant === "overview";
  const patternsAvailable = data.status === "patterns_available";
  const populationReady = data.readiness.sufficientManagerPopulation;

  return (
    <section
      className={
        isOverview
          ? "manager-dev-intel manager-dev-intel--overview"
          : "manager-dev-intel"
      }
      aria-labelledby={
        isOverview ? "manager-dev-intel-overview-heading" : "manager-dev-intel-heading"
      }
    >
      <header className="manager-dev-intel__intro">
        {isOverview ? (
          <>
            <p className="manager-dev-intel__eyebrow">Organisation Development</p>
            <h2
              id="manager-dev-intel-overview-heading"
              className="manager-dev-intel__title"
            >
              What should I know about management development here?
            </h2>
          </>
        ) : (
          <h2 id="manager-dev-intel-heading" className="sr-only">
            Manager Development Intelligence
          </h2>
        )}
        <p className="manager-dev-intel__lede">
          A current, privacy-safe view of where collective Manager development
          attention is concentrated. It shows patterns, not individual records,
          rankings or performance scores.
        </p>
      </header>

      <p className="manager-dev-intel__lens-note">
        {isOverview ? LEAD_OVERVIEW_LENS_NOTE : LEAD_LENS_SEPARATION_COPY}
      </p>

      {patternsAvailable ? (
        <PatternsAvailable data={data} isOverview={isOverview} />
      ) : (
        <LowDataState
          populationReady={populationReady}
          message={data.message}
          isOverview={isOverview}
        />
      )}

      {isOverview ? (
        <p className="manager-dev-intel__cta-row">
          <Link
            href="/organisation/manager-development"
            className="manager-dev-intel__cta"
          >
            Open Manager Development Intelligence
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function LowDataState({
  populationReady,
  message,
  isOverview,
}: {
  populationReady: boolean;
  message: string | null;
  isOverview: boolean;
}) {
  return (
    <div className="manager-dev-intel__panel" role="status">
      <h3 className="manager-dev-intel__section-label">What we&apos;re seeing</h3>
      <p className="manager-dev-intel__primary-message">
        {message ||
          "Organisation-wide Manager development patterns are not yet available."}
      </p>
      <p className="organisation-muted">
        Patterns appear only when enough Managers contribute similar development
        themes. Private individual Manager records are not shown instead. Missing
        patterns do not prove that no development need exists.
      </p>
      {!populationReady ? (
        <p className="organisation-muted">
          A larger Manager population is needed before collective patterns can
          be displayed.
        </p>
      ) : null}

      <div className="manager-dev-intel__next">
        <h3 className="manager-dev-intel__section-label">What you could do next</h3>
        <p className="manager-dev-intel__next-title">
          Support Managers to use My Development
        </p>
        <p className="organisation-muted">
          Invite Managers, help them set a clear development focus, and
          encourage regular reflection so privacy-safe organisational patterns
          can emerge over time.
        </p>
        {!isOverview ? (
          <p className="manager-dev-intel__admin-hint organisation-muted">
            Member invitations remain available from Organisation → Members.
          </p>
        ) : null}
      </div>

      <AboutThisPicture />
    </div>
  );
}

function PatternsAvailable({
  data,
  isOverview,
}: {
  data: ManagerDevelopmentLeadPayload;
  isOverview: boolean;
}) {
  const visiblePatterns = isOverview ? data.patterns.slice(0, 3) : data.patterns;
  const [primaryPattern, ...otherPatterns] = visiblePatterns;
  const nextStep = data.nextStep;

  if (!primaryPattern) return null;

  return (
    <div className="manager-dev-intel__panel">
      <div
        className={
          nextStep
            ? "manager-dev-intel__insight-grid"
            : "manager-dev-intel__insight-grid manager-dev-intel__insight-grid--single"
        }
      >
        <article className="manager-dev-intel__pattern manager-dev-intel__pattern--primary">
          <p className="manager-dev-intel__section-label">
            Priority development signal
          </p>
          <h3 className="manager-dev-intel__pattern-title">
            {primaryPattern.themeLabel}
          </h3>
          <p className="manager-dev-intel__strength">
            <span className="manager-dev-intel__strength-label">
              {strengthDisplayLabel(primaryPattern.strength)}
            </span>
            <span className="manager-dev-intel__strength-copy">
              {STRENGTH_EXPLANATIONS[primaryPattern.strength] ??
                STRENGTH_EXPLANATIONS.emerging}
            </span>
          </p>
          {themeDescriptionForKey(primaryPattern.themeKey) ? (
            <p className="manager-dev-intel__meaning">
              {themeDescriptionForKey(primaryPattern.themeKey)}
            </p>
          ) : null}
        </article>

        {nextStep ? (
          <aside
            className="manager-dev-intel__next"
            aria-label="Recommended organisational response"
          >
            <p className="manager-dev-intel__section-label">
              Recommended response
            </p>
            <h3 className="manager-dev-intel__next-title">
              {nextStep.title}
            </h3>
            <p className="manager-dev-intel__next-copy">
              {nextStep.suggestion}
            </p>
            <div className="manager-dev-intel__watch">
              <h4 className="manager-dev-intel__watch-title">
                What to watch
              </h4>
              <p>{nextStep.watchFor}</p>
            </div>
          </aside>
        ) : null}
      </div>

      {otherPatterns.length > 0 ? (
        <div className="manager-dev-intel__block">
          <h3 className="manager-dev-intel__section-heading">
            Other shared signals
          </h3>
          <ul className="manager-dev-intel__pattern-list">
            {otherPatterns.map(pattern => {
              const description = themeDescriptionForKey(pattern.themeKey);
              return (
                <li
                  key={pattern.themeKey}
                  className="manager-dev-intel__pattern"
                >
                  <div className="manager-dev-intel__pattern-heading">
                    <h4 className="manager-dev-intel__pattern-title">
                      {pattern.themeLabel}
                    </h4>
                    <span className="manager-dev-intel__strength-label">
                      {strengthDisplayLabel(pattern.strength)}
                    </span>
                  </div>
                  <p className="manager-dev-intel__strength-copy">
                    {STRENGTH_EXPLANATIONS[pattern.strength] ??
                      STRENGTH_EXPLANATIONS.emerging}
                  </p>
                  {description ? (
                    <p className="manager-dev-intel__meaning">{description}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {isOverview && data.patterns.length > visiblePatterns.length ? (
            <p className="organisation-muted">
              Additional shared signals are available in the full Manager
              Development Intelligence view.
            </p>
          ) : null}
        </div>
      ) : null}

      <AboutThisPicture />
    </div>
  );
}

function AboutThisPicture() {
  return (
    <details className="manager-dev-intel__about">
      <summary>How to read this intelligence</summary>
      <div className="manager-dev-intel__about-content">
        <p>{LEAD_PRIVACY_BOUNDARY_COPY}</p>
        <p>{LEAD_MANAGER_DI_INTERPRETATION_COPY}</p>
      </div>
    </details>
  );
}
