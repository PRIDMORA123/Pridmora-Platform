"use client";

import { BRAND } from "@/lib/brand";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

/**
 * Manager's own development space — kept distinct from people they support.
 * Uses the personal workspace framing; does not mix employee records.
 */
export function MyDevelopmentView({
  onOpenPeople,
  onSwitchToPersonal,
  onOpenTeamIntelligence,
  onOpenPersonalEvidence,
  isPersonalWorkspace,
}: {
  onOpenPeople: () => void;
  onSwitchToPersonal?: () => void;
  onOpenTeamIntelligence?: () => void;
  onOpenPersonalEvidence?: () => void;
  isPersonalWorkspace: boolean;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);

  return (
    <section className="page identity-reveal">
      <div className="page-heading">
        <p className="eyebrow">{language.myDevelopmentLabel}</p>
        <h1>My development</h1>
        <p>
          Your own development intelligence — separate from the people you manage
          or support.
        </p>
      </div>

      <nav className="person-development-subnav" aria-label="My development sections">
        <span className="person-development-subnav__item is-active">Overview</span>
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenPersonalEvidence}
        >
          Development Evidence
        </button>
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenTeamIntelligence}
        >
          Team Intelligence
        </button>
      </nav>

      <div className="two-grid">
        <article className="panel">
          <p className="card-label">Your record</p>
          <h2 className="identity-subheading">Develop yourself</h2>
          <p className="muted">
            Upload your own 360, leadership assessment, PDP or reflection into
            Development Evidence. Reviewed evidence contributes only to your personal
            Development Intelligence — never to people you manage.
          </p>
          {!isPersonalWorkspace && onSwitchToPersonal ? (
            <div className="button-row">
              <button type="button" className="primary" onClick={onSwitchToPersonal}>
                Open personal workspace
              </button>
              {onOpenPersonalEvidence ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={onOpenPersonalEvidence}
                >
                  Development Evidence
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <p className="muted">
                You are in your personal workspace. Create or open your own development
                relationship from People when you are receiving support, then add
                evidence there.
              </p>
              {onOpenPersonalEvidence ? (
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={onOpenPersonalEvidence}
                  >
                    Open Development Evidence
                  </button>
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className="panel">
          <p className="card-label">{language.myPeopleLabel}</p>
          <h2 className="identity-subheading">Develop others</h2>
          <p className="muted">
            {BRAND.intelligenceName} helps you prepare, reflect and interpret
            development evidence for the people you support — without mixing their
            records into your own.
          </p>
          <div className="button-row">
            <button type="button" className="secondary" onClick={onOpenPeople}>
              View {language.myPeopleLabel.toLowerCase()}
            </button>
            {onOpenTeamIntelligence ? (
              <button
                type="button"
                className="secondary"
                onClick={onOpenTeamIntelligence}
              >
                Team Intelligence
              </button>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
