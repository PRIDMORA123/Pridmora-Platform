import type { ReactNode } from "react";

export function AuthFormLayout({
  eyebrow,
  title,
  description,
  supporting,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  supporting?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="auth-form-panel">
      <div className="auth-form">
        <header className="auth-form__header">
          <p className="auth-form__eyebrow">{eyebrow}</p>
          <h2 className="auth-form__title">{title}</h2>
          {description ? <p className="auth-form__description">{description}</p> : null}
          {supporting ? <p className="auth-form__supporting">{supporting}</p> : null}
        </header>
        {children}
        {footer ? <div className="auth-form__footer">{footer}</div> : null}
      </div>
    </section>
  );
}
