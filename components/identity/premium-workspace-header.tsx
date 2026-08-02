import { IdentitySectionMark } from "@/components/identity/section-mark";

export type PremiumWorkspaceHeaderProps = {
  coachName: string;
  greeting: string;
  summary: string;
  onCreatePerson: () => void;
};

export function PremiumWorkspaceHeader({
  coachName,
  greeting,
  summary,
  onCreatePerson,
}: PremiumWorkspaceHeaderProps) {
  return (
    <header className="premium-workspace-header">
      <div className="premium-workspace-heading">
        <IdentitySectionMark />

        <div>
          <p className="premium-workspace-eyebrow">Your coaching workspace</p>

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
