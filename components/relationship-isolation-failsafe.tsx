import {
  RELATIONSHIP_ISOLATION_FAILSAFE_BODY,
  RELATIONSHIP_ISOLATION_FAILSAFE_TITLE,
} from "@/lib/relationship-scope";

export function RelationshipIsolationFailsafe({
  title = RELATIONSHIP_ISOLATION_FAILSAFE_TITLE,
  body = RELATIONSHIP_ISOLATION_FAILSAFE_BODY,
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section
      className="page identity-reveal identity-page-shell"
      role="alert"
      data-testid="relationship-isolation-failsafe"
    >
      <article className="panel empty-panel">
        <h2>{title}</h2>
        <p className="muted empty-state">{body}</p>
      </article>
    </section>
  );
}
