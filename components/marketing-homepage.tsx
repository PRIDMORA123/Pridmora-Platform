"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function MarketingHomepage() {
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <div className="marketing-brand">{BRAND.productName}</div>
        <div className="button-row">
          <Link className="secondary" href="/auth/sign-in">
            Sign in
          </Link>
          <Link className="primary" href="/auth/sign-up">
            Start free
          </Link>
        </div>
      </header>

      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <p className="eyebrow">{BRAND.productName}</p>
          <h1 className="identity-display">{BRAND.productDescriptor}</h1>
          <p className="marketing-lead">
            Organise development conversations, capture what matters and build an evidence-based
            understanding of the people you support—so every future conversation starts with greater
            clarity.
          </p>
          <div className="button-row">
            <Link className="primary" href="/auth/sign-up">
              Start free
            </Link>
            <a className="secondary" href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>
        <div className="marketing-hero-visual" aria-hidden="true">
          <div className="product-mock">
            <div className="product-mock-bar">
              <span />
              <span />
              <span />
            </div>
            <p className="eyebrow">Development intelligence</p>
            <h3>Strategic thinking</h3>
            <p className="muted">Evidence suggests a recurring strength across recent conversations.</p>
            <div className="product-mock-row">
              <span className="pill approved-pill">Coach-approved</span>
              <span className="pill">Supported</span>
              <span className="pill">3 conversations</span>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <h2>Important insight should not disappear into old notes.</h2>
        <p>
          Every development conversation reveals strengths, values, beliefs, patterns, commitments
          and opportunities. Most systems record the meeting. This platform helps turn those
          conversations into useful, reviewable intelligence.
        </p>
      </section>

      <section className="marketing-section" id="how-it-works">
        <h2>Organise. Understand. Improve.</h2>
        <div className="marketing-three">
          <article>
            <h3>Organise</h3>
            <p>
              Prepare, run and review every development conversation in one clear workspace.
            </p>
          </article>
          <article>
            <h3>Understand</h3>
            <p>
              Build a living, evidence-based picture of strengths, values, themes, beliefs and
              progress.
            </p>
          </article>
          <article>
            <h3>Improve</h3>
            <p>
              Use accumulated intelligence to prepare better questions and make every future
              conversation more informed.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-section">
        <h2>Intelligence that grows with every conversation.</h2>
        <ol className="intelligence-loop">
          <li>Capture</li>
          <li>Interpret</li>
          <li>Validate</li>
          <li>Apply</li>
          <li>Learn</li>
        </ol>
        <p>
          The platform identifies possible patterns and insights from each conversation. You review
          the evidence, decide what is valid and remain in control of the developing record.
        </p>
      </section>

      <section className="marketing-section">
        <h2>Nothing is accepted without evidence.</h2>
        <p>
          Every proposed insight shows why it was identified, where the evidence came from and
          whether it has been approved by the practitioner. Edit it, reject it or strengthen it over
          time.
        </p>
        <div className="trust-example">
          <div>
            <small>Strength</small>
            <strong>Strategic thinking</strong>
          </div>
          <div>
            <small>Status</small>
            <strong>Supported</strong>
          </div>
          <div>
            <small>Evidence</small>
            <strong>3 conversations</strong>
          </div>
          <div>
            <small>Validation</small>
            <strong>Coach approved</strong>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <h2>Built for people who develop people.</h2>
        <p>
          For professional coaches, managers, leaders, mentors and people-development practitioners
          who want every conversation to build on the last.
        </p>
      </section>

      <section className="marketing-section marketing-final">
        <h2>Make the next conversation better than the last.</h2>
        <div className="button-row">
          <Link className="primary" href="/auth/sign-up">
            Start free
          </Link>
        </div>
      </section>
    </div>
  );
}
