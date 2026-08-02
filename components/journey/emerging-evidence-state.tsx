type EmergingEvidenceStateProps = {
  title?: string;
  description?: string;
};

export function EmergingEvidenceState({
  title = "Evidence still emerging",
  description =
    "Further coaching conversations and reviewed evidence will help establish a clearer development picture.",
}: EmergingEvidenceStateProps) {
  return (
    <div className="emerging-evidence-state">
      <p className="emerging-evidence-state__label">Emerging</p>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
