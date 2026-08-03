import { BRAND } from "@/lib/brand";

const supportItems = [
  "Capture what matters.",
  "Reveal meaningful patterns.",
  "Support confident professional judgement.",
] as const;

export function AuthBrandPanel() {
  return (
    <section className="auth-brand" aria-label={`${BRAND.productName} brand`}>
      <div className="auth-brand__top">
        <p className="auth-brand__wordmark">{BRAND.companyName}</p>
        <p className="auth-brand__descriptor">{BRAND.productShortName}</p>
      </div>

      <div className="auth-brand__body">
        <div className="auth-brand__copy">
          <h1 className="auth-brand__hero">
            <span className="auth-brand__line">Development intelligence</span>
            <span className="auth-brand__line">that transforms professional</span>
            <span className="auth-brand__line">
              conversations <span className="auth-brand__hero-accent">into evidence.</span>
            </span>
          </h1>

          <ul className="auth-brand__support">
            {supportItems.map(text => (
              <li key={text} className="auth-brand__support-item">
                <span className="auth-brand__support-marker" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-brand__philosophy">
        <p className="auth-brand__philosophy-lead">Evidence before certainty.</p>
        <div className="auth-brand__philosophy-rest">
          <p>AI supports.</p>
          <p>Professional judgement decides.</p>
        </div>
      </div>
    </section>
  );
}
