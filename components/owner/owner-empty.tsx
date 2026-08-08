export function OwnerEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="owner-empty" role="status">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
