import type { ReactNode } from "react";
import { IdentitySectionMark } from "@/components/identity/section-mark";

type IdentitySectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  id?: string;
  /** Sparse Pridmora path mark — use only for signature section titles. */
  branded?: boolean;
};

export function IdentitySection({
  title,
  description,
  action,
  children,
  compact = false,
  id,
  branded = false,
}: IdentitySectionProps) {
  return (
    <section
      id={id}
      className={`identity-section${compact ? " identity-section-compact" : ""}`}
    >
      <header className="identity-section-header">
        <div className={branded ? "identity-branded-heading" : undefined}>
          {branded ? <IdentitySectionMark /> : null}
          <div>
            <h2 className="identity-section-title">{title}</h2>

            {description ? (
              <p className="identity-section-description">{description}</p>
            ) : null}
          </div>
        </div>

        {action ? <div className="identity-section-action">{action}</div> : null}
      </header>

      <div className="identity-section-content">{children}</div>
    </section>
  );
}
