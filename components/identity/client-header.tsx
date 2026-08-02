type ClientIdentityHeaderProps = {
  name: string;
  role?: string | null;
  organisation?: string | null;
  journeyStage?: string | null;
  developmentFocus?: string | null;
  latestConversationDate?: string | null;
  sessionLine?: string | null;
  sessionStatus?: string | null;
  /** When false, omit summary facts (used when a page section already answers “where are we?”). */
  showSummary?: boolean;
  actions?: React.ReactNode;
};

export function ClientIdentityHeader({
  name,
  role,
  organisation,
  journeyStage,
  developmentFocus,
  latestConversationDate,
  sessionLine,
  sessionStatus,
  showSummary = false,
  actions,
}: ClientIdentityHeaderProps) {
  const meta = [role, organisation].filter(Boolean).join(" · ");
  const sessionParts = [sessionLine, sessionStatus].filter(Boolean);

  return (
    <section
      className={`client-identity-header client-identity-header--compact${
        showSummary ? "" : " client-identity-header-simple"
      }`}
    >
      <div className="client-identity-primary">
        <p className="client-identity-eyebrow">Coaching relationship</p>

        <h1 className="client-identity-name">{name}</h1>

        {meta ? <p className="client-identity-role">{meta}</p> : null}

        {sessionParts.length ? (
          <p className="client-identity-session">{sessionParts.join(" · ")}</p>
        ) : null}
      </div>

      {showSummary ? (
        <dl className="client-identity-summary">
          <HeaderDetail
            label="Current stage"
            value={journeyStage || "Coaching relationship established"}
          />
          <HeaderDetail
            label="Current focus"
            value={developmentFocus || "Not recorded yet"}
          />
          <HeaderDetail
            label="Latest conversation"
            value={latestConversationDate || "No conversation yet"}
          />
        </dl>
      ) : null}

      {actions ? (
        <div className="client-identity-actions">{actions}</div>
      ) : null}
    </section>
  );
}

function HeaderDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="client-identity-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
