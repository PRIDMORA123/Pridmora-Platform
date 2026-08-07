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
  isPersonalWorkspace,
}: {
  onOpenPeople: () => void;
  onSwitchToPersonal?: () => void;
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

      <div className="two-grid">
        <article className="panel">
          <p className="card-label">Your record</p>
          <h2 className="identity-subheading">Develop yourself</h2>
          <p className="muted">
            Use your personal workspace for your own development conversations,
            preparation and evidence. Team member records stay in the organisation
            workspace.
          </p>
          {!isPersonalWorkspace && onSwitchToPersonal ? (
            <div className="button-row">
              <button type="button" className="primary" onClick={onSwitchToPersonal}>
                Open personal workspace
              </button>
            </div>
          ) : (
            <p className="muted">
              You are in your personal workspace. Create or open your own development
              relationships from People when you are receiving support.
            </p>
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
          </div>
        </article>
      </div>
    </section>
  );
}
