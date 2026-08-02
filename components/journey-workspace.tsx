import type { ReactNode } from "react";

export function JourneyPage({
  header,
  currentPosition,
  lookingAhead,
  developmentPath,
}: {
  header?: ReactNode;
  currentPosition: ReactNode;
  lookingAhead: ReactNode;
  developmentPath: ReactNode;
}) {
  return (
    <div className="journey-page">
      {header}
      <div className="journey-primary-grid">
        {currentPosition}
        {lookingAhead}
      </div>
      {developmentPath}
    </div>
  );
}
