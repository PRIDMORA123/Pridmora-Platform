export function OwnerStatus({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const normalised = value.toLowerCase().replace(/\s+/g, "_");
  return (
    <span className={`owner-status owner-status--${normalised}`}>
      {label ?? value}
    </span>
  );
}
