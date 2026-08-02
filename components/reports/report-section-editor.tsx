export function ReportSectionEditor({
  label,
  value,
  onChange,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}) {
  return (
    <section className="report-section-editor">
      <div className="report-section-editor-heading">
        <label>{label}</label>
        {helperText ? <span>{helperText}</span> : null}
      </div>

      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={5}
      />
    </section>
  );
}
