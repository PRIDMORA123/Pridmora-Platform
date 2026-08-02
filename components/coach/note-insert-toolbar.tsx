type NoteInsertToolbarProps = {
  onInsert: (text: string) => void;
  disabled?: boolean;
};

const NOTE_TEMPLATES = [
  { label: "Observation", value: "Observation\n\n" },
  { label: "Insight", value: "Insight\n\n" },
  { label: "Evidence", value: "Evidence\n\n" },
  { label: "Action", value: "Agreed action\n\n" },
];

export function NoteInsertToolbar({
  onInsert,
  disabled = false,
}: NoteInsertToolbarProps) {
  return (
    <div className="coach-note-toolbar">
      <span>Insert</span>

      {NOTE_TEMPLATES.map(template => (
        <button
          type="button"
          key={template.label}
          disabled={disabled}
          onClick={() => onInsert(template.value)}
        >
          {template.label}
        </button>
      ))}
    </div>
  );
}
