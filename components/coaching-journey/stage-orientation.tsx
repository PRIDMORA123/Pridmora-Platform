import { StageHeader } from "@/components/coaching-journey/stage-header";

export type StageOrientationProps = {
  eyebrow?: string;
  title: string;
  description: string;
  nextLabel?: string;
  optional?: boolean;
};

/**
 * Current-stage orientation — answers “where am I?” and “what should I do?”
 * Not wrapped in a card. Uses the vertical StageHeader composition.
 */
export function StageOrientation({
  eyebrow,
  title,
  description,
  nextLabel,
  optional = false,
}: StageOrientationProps) {
  return (
    <div className="stage-orientation">
      <StageHeader
        eyebrow={eyebrow?.trim() || title}
        title={title}
        description={description}
        optional={optional}
      />
      {nextLabel ? (
        <p className="stage-orientation__next-label">{nextLabel}</p>
      ) : null}
    </div>
  );
}
