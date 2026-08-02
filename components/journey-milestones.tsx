export function JourneyMilestones({
  milestones,
}: {
  milestones: string[];
}) {
  if (milestones.length === 0) return null;

  return (
    <ul className="journey-milestones">
      {milestones.slice(0, 6).map(milestone => (
        <li key={milestone}>
          <span className="journey-milestone-marker" aria-hidden="true" />
          <span>{milestone}</span>
        </li>
      ))}
    </ul>
  );
}
