"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * Public platform landing page for signed-out visitors on `/`.
 * Rendered by `app/page.tsx` when `getSessionUser()` returns null.
 * Acquisition is organisation-led (Request a demo); no public self-service trial.
 */
export function MarketingHomepage() {
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <div className="marketing-brand">{BRAND.productName}</div>
        <div className="button-row">
          <Link className="secondary" href="/auth/sign-in">
            Sign in
          </Link>
          <a
            className="primary"
            href={BRAND.requestDemoUrl}
            rel="noopener noreferrer"
          >
            Request a demo
          </a>
        </div>
      </header>

      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <p className="eyebrow">{BRAND.productName}</p>
          <h1 className="identity-display">
            Understand how your managers are developing.
          </h1>
          <p className="marketing-lead">
            Pridmora turns everyday development conversations into a clearer,
            evidence-based understanding of each manager&apos;s strengths,
            priorities and progress, helping every future conversation start
            with greater clarity.
          </p>
          <div className="button-row">
            <a
              className="primary"
              href={BRAND.requestDemoUrl}
              rel="noopener noreferrer"
            >
              Request a demo
            </a>
            <a className="secondary" href="#how-it-works">
              See how it works
            </a>
          </div>
          <p className="muted marketing-trial-note">
            Organisation pilots are provisioned for your team. Authorised users
            are invited after a buyer conversation.
          </p>
        </div>

        <div className="marketing-hero-visual" aria-hidden="true">
          <div className="product-mock product-mock--snapshot">
            <div className="product-mock-bar">
              <span />
              <span />
              <span />
            </div>
            <p className="eyebrow">Development snapshot</p>

            <div className="product-mock-block">
              <p className="product-mock-label">Current position</p>
              <p>
                Growing confidence in leading former peers while setting clearer
                expectations.
              </p>
            </div>

            <div className="product-mock-block">
              <p className="product-mock-label">Development strengthening</p>
              <ul className="product-mock-list">
                <li>Delegation</li>
                <li>Accountability</li>
                <li>Difficult conversations</li>
              </ul>
            </div>

            <div className="product-mock-block">
              <p className="product-mock-label">Current focus</p>
              <p>Address performance concerns earlier.</p>
            </div>

            <div className="product-mock-block">
              <p className="product-mock-label">Evidence base</p>
              <ul className="product-mock-list product-mock-list--evidence">
                <li>7 development conversations</li>
                <li>2 reflections</li>
                <li>1 feedback review</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <h2>Conversations end. Understanding shouldn&apos;t.</h2>
        <p>
          Every development conversation contains observations, commitments and
          evidence of change. Pridmora turns what matters into trusted
          development intelligence that grows over time.
        </p>
      </section>

      <section className="marketing-section" id="how-it-works">
        <h2>Understand. Prepare. Improve.</h2>
        <div className="marketing-three">
          <article>
            <h3>Understand</h3>
            <p>
              Build a clear picture of who each person is and where they are
              developing.
            </p>
          </article>
          <article>
            <h3>Prepare</h3>
            <p>
              Use Aurelia when helpful to enter conversations with sharper focus
              and better questions.
            </p>
          </article>
          <article>
            <h3>Improve</h3>
            <p>
              Capture what mattered so development intelligence grows with every
              conversation.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-section">
        <h2>Evidence before certainty.</h2>
        <p>
          Insights remain proposed until reviewed. Evidence confidence and
          coverage stay visible so managers and leaders know what can be trusted
          and what still needs exploration.
        </p>
      </section>

      <section className="marketing-section">
        <h2>Built for people who develop people.</h2>
        <p>
          For managers, department leaders, HR and L&amp;D teams, and
          professional coaches who want every conversation to build on the last.
        </p>
      </section>

      <section className="marketing-section marketing-final">
        <h2>Make the next conversation better than the last.</h2>
        <div className="button-row">
          <a
            className="primary"
            href={BRAND.requestDemoUrl}
            rel="noopener noreferrer"
          >
            Request a demo
          </a>
        </div>
        <p className="muted marketing-trial-note">
          Speak with us to arrange an organisational pilot for your managers.
        </p>
      </section>
    </div>
  );
}
