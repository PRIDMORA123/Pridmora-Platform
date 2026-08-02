export type StageWorkspaceProps = {
  children: React.ReactNode;
  className?: string;
  /** Accessible label for the principal work region. */
  label?: string;
};

/**
 * One principal work area for the current journey stage.
 */
export function StageWorkspace({
  children,
  className,
  label = "Stage workspace",
}: StageWorkspaceProps) {
  return (
    <div
      className={["stage-workspace", className].filter(Boolean).join(" ")}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}
