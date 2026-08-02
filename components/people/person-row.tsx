type PersonRowProps = {
  person: {
    id: string;
    name: string;
    role?: string | null;
    organisation?: string | null;
    journeyStatus: string;
    developmentFocus?: string | null;
    /** Full focus text for accessible label / title when preview is shortened. */
    developmentFocusFull?: string | null;
    nextActionLabel: string;
  };
  onOpen: () => void;
};

export function PersonRow({ person, onOpen }: PersonRowProps) {
  const focusPreview =
    person.developmentFocus?.trim() || "No development focus recorded yet.";
  const focusFull = person.developmentFocusFull?.trim() || focusPreview;
  const meta = [person.role, person.organisation].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="identity-person-row"
      onClick={onOpen}
      aria-label={`Open relationship for ${person.name}. Next action: ${person.nextActionLabel}. Development focus: ${focusFull}`}
    >
      <div className="identity-person-row__person">
        <strong className="identity-person-row__name">{person.name}</strong>
        <span className="identity-person-row__meta">
          {meta || "Role and organisation not set"}
        </span>
      </div>

      <div className="identity-person-row__journey">
        <small>Current journey</small>
        <span className="identity-person-row__status">{person.journeyStatus}</span>
      </div>

      <div className="identity-person-row__focus">
        <small>Development focus</small>
        <p title={focusFull}>{focusPreview}</p>
      </div>

      <div className="identity-person-row__next">
        <small>Next action</small>
        <span className="identity-person-row__action">{person.nextActionLabel}</span>
      </div>
    </button>
  );
}
