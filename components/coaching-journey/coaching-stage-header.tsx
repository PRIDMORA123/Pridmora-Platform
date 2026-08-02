import { getRelationshipSubtitle } from "@/lib/coaching-journey";

export type CoachingStageHeaderProps = {
  eyebrow: string;
  title: string;
  role?: string;
  organisation?: string;
  subtitle?: string;
  sessionLine?: string | null;
  sessionMeta?: string | null;
  optional?: boolean;
  actions?: React.ReactNode;
};

export function CoachingStageHeader({
  eyebrow,
  title,
  role,
  organisation,
  subtitle,
  sessionLine,
  sessionMeta,
  optional = false,
  actions,
}: CoachingStageHeaderProps) {
  const resolvedSubtitle =
    subtitle ?? getRelationshipSubtitle({ role, organisation });

  return (
    <header className="identity-coaching-stage-header">
      <div className="identity-coaching-stage-header__copy">
        <p className="identity-coaching-stage-header__eyebrow">
          {eyebrow}
          {optional ? (
            <span className="identity-coaching-stage-header__optional">
              Optional
            </span>
          ) : null}
        </p>
        <h1 className="identity-coaching-stage-header__title">{title}</h1>
        {resolvedSubtitle ? (
          <p className="identity-coaching-stage-header__subtitle">
            {resolvedSubtitle}
          </p>
        ) : null}
        {sessionLine ? (
          <p className="identity-coaching-stage-header__session">{sessionLine}</p>
        ) : null}
        {sessionMeta ? (
          <p className="identity-coaching-stage-header__meta">{sessionMeta}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="identity-coaching-stage-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
