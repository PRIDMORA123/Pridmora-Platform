/**
 * Static preview of Sample Organisation installer UI states.
 * Dev-only reference — does not call install APIs or touch data.
 */
import Link from "next/link";

const STATES = [
  {
    id: "available",
    title: "Available pack",
    notes: "Install CTA, pack details, estimated setup time, privacy note",
  },
  {
    id: "confirm-install",
    title: "Install confirmation",
    notes: "Install sample organisation? Cancel / Install",
  },
  {
    id: "progress",
    title: "Installation progress",
    notes: "Real stage list from SAMPLE_PROGRESS_STAGES",
  },
  {
    id: "complete",
    title: "Completion state",
    notes: "Sample organisation ready + Open / View Intelligence",
  },
  {
    id: "installed",
    title: "Installed state",
    notes: "Status, counts, Open / Reset / Remove",
  },
  {
    id: "confirm-reset",
    title: "Reset confirmation",
    notes: "Reset sample organisation?",
  },
  {
    id: "confirm-remove",
    title: "Remove confirmation",
    notes: "Requires typing REMOVE",
  },
  {
    id: "mobile",
    title: "Mobile view",
    notes: "Resize /settings/sample-organisation below 720px",
  },
] as const;

export default function SampleOrganisationPreviewPage() {
  return (
    <main className="organisation-layout identity-app-surface" style={{ padding: "2rem" }}>
      <p className="organisation-header__eyebrow">SAMPLE ORGANISATION</p>
      <h1 className="organisation-header__title">Installer preview index</h1>
      <p className="organisation-muted">
        Live installer UI:{" "}
        <Link className="organisation-text-link" href="/settings/sample-organisation">
          /settings/sample-organisation
        </Link>
      </p>
      <ol className="sample-organisation__features" style={{ marginTop: "1.5rem" }}>
        {STATES.map(state => (
          <li key={state.id}>
            <strong>{state.title}</strong>
            {" — "}
            {state.notes}
          </li>
        ))}
      </ol>
    </main>
  );
}
