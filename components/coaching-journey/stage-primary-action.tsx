export type StagePrimaryActionProps = {
  children: React.ReactNode;
  className?: string;
  /** When true, sticks above the viewport bottom for long forms. */
  sticky?: boolean;
};

/**
 * Primary stage action — placed immediately after the work it completes.
 */
export function StagePrimaryAction({
  children,
  className,
  sticky = false,
}: StagePrimaryActionProps) {
  return (
    <div
      className={[
        "stage-primary-action",
        sticky ? "stage-primary-action--sticky" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
