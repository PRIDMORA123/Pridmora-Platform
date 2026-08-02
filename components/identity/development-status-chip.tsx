export type DevelopmentStatus =
  | "emerging"
  | "developing"
  | "strengthening"
  | "established";

export type DevelopmentStatusChipProps = {
  status: DevelopmentStatus;
};

export const DEVELOPMENT_STATUS_LABELS: Record<DevelopmentStatus, string> = {
  emerging: "Emerging",
  developing: "Developing",
  strengthening: "Strengthening",
  established: "Established",
};

/**
 * Canonical development-status chip — horizontal pill, never wraps.
 */
export function DevelopmentStatusChip({ status }: DevelopmentStatusChipProps) {
  const label = DEVELOPMENT_STATUS_LABELS[status];

  return (
    <span
      className="identity-development-status"
      data-status={status}
      aria-label={`Development status: ${label}`}
    >
      {label}
    </span>
  );
}
