import {
  EVIDENCE_STRENGTH_LABELS,
  type EvidenceStrength,
} from "@/components/identity-intelligence/types";

export type IdentityEvidenceStrengthProps = {
  strength: EvidenceStrength;
  /** Accessible description of what supports this strength. */
  description?: string;
};

const DEFAULT_DESCRIPTIONS: Record<EvidenceStrength, string> = {
  emerging: "Supported by limited approved evidence.",
  supported: "Supported by multiple approved records.",
  established: "Consistent evidence across approved records.",
};

export function IdentityEvidenceStrength({
  strength,
  label,
  description,
}: IdentityEvidenceStrengthProps & { label?: string }) {
  const display = label ?? EVIDENCE_STRENGTH_LABELS[strength];
  const accessible = description ?? DEFAULT_DESCRIPTIONS[strength];

  return (
    <span
      className="identity-evidence-strength"
      data-strength={strength}
      title={accessible}
    >
      {display}
      <span className="sr-only">. {accessible}</span>
    </span>
  );
}
