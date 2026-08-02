import { StageWorkspace } from "@/components/coaching-journey/stage-workspace";

export type JourneyStagePageProps = {
  className?: string;
  /** 1. Back navigation */
  back: React.ReactNode;
  /** 2. Coaching journey navigation */
  navigation?: React.ReactNode;
  /** Optional banners between nav and identity */
  banners?: React.ReactNode;
  /** 3. Compact relationship identity */
  identity: React.ReactNode;
  /** 4. Current-stage orientation */
  orientation: React.ReactNode;
  /** 5. Principal work area */
  children: React.ReactNode;
  /** 6. Next-step guidance (above or below workspace) */
  nextStep?: React.ReactNode;
  nextStepPosition?: "before" | "after";
  /** 7. One primary action */
  primaryAction?: React.ReactNode;
  workspaceLabel?: string;
  workspaceClassName?: string;
};

/**
 * Locked page composition for every Identity journey stage.
 * Order is fixed — do not rearrange per page.
 */
export function JourneyStagePage({
  className,
  back,
  navigation,
  banners,
  identity,
  orientation,
  children,
  nextStep,
  nextStepPosition = "after",
  primaryAction,
  workspaceLabel,
  workspaceClassName,
}: JourneyStagePageProps) {
  return (
    <section
      className={[
        "page",
        "identity-reveal",
        "identity-page-shell",
        "journey-stage-page",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {back}
      {navigation}
      {banners}
      <div className="identity-workspace-container">
        <div className="journey-stage-page__chrome">
          {identity}
          {orientation}
        </div>
        {nextStep && nextStepPosition === "before" ? nextStep : null}
        <StageWorkspace label={workspaceLabel} className={workspaceClassName}>
          {children}
        </StageWorkspace>
        {nextStep && nextStepPosition === "after" ? nextStep : null}
        {primaryAction}
      </div>
    </section>
  );
}
