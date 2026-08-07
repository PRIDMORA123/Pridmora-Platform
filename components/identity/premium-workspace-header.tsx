import { IdentitySectionMark } from "@/components/identity/section-mark";

export type PremiumWorkspaceHeaderProps = {
  coachName: string;
  greeting: string;
  summary: string;
  onCreatePerson: () => void;
  eyebrow?: string;
};

export function PremiumWorkspaceHeader({
  coachName,
  greeting,
  summary,
  onCreatePerson,
  eyebrow = "My Management Overview",
}: PremiumWorkspaceHeaderProps) {
  return (
    <header className="premium-workspace-header">
      <div className="premium-workspace-heading">
        <IdentitySectionMark />

        <div>
          <p className="premium-workspace-eyebrow">{eyebrow}</p>

          <h1>
            {greeting}, {coachName}
          </h1>

          <p className="premium-workspace-summary">{summary}</p>
        </div>
      </div>

      <button
        type="button"
        className="identity-button identity-button--secondary"
        onClick={onCreatePerson}
      >
        <span aria-hidden="true">+</span>
        <span>New person</span>
      </button>
    </header>
  );
}
