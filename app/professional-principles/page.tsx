import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, getProductTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: getProductTitle("Professional principles"),
  description: `The professional principles that guide ${BRAND.productName} coaching practice.`,
};

const PRINCIPLES = [
  {
    title: "Evidence before certainty",
    body: "Insights remain proposed until they are reviewed against coaching evidence. Early impressions are held lightly.",
  },
  {
    title: "AI assists, the coach decides",
    body: `${BRAND.intelligenceName} may prepare drafts and suggestions, but only the coach can review, edit and approve what becomes part of the record.`,
  },
  {
    title: "Private reflection remains private",
    body: "Coach reflection supports professional judgement. Private notes are excluded from shared summaries and reports.",
  },
  {
    title: "Development is demonstrated over time",
    body: "Meaningful development emerges across conversations, commitments and reviewed evidence — not from a single statement.",
  },
  {
    title: "Coaching records should remain proportionate",
    body: "Capture what is useful for the next conversation and for understanding development. Avoid unnecessary detail.",
  },
];

export default function ProfessionalPrinciplesPage() {
  return (
    <main className="professional-principles-page">
      <p className="identity-section-heading__eyebrow">{BRAND.productShortName}</p>
      <h1>Professional principles</h1>
      <p className="lead">
        These principles guide how {BRAND.productName} supports professional
        coaching practice. {BRAND.productName} is operated by{" "}
        {BRAND.legalCompanyName}.
      </p>
      <p className="lead">
        {BRAND.intelligenceName} supports practitioners by proposing draft
        preparation, summaries and development observations for professional
        review.
      </p>

      {PRINCIPLES.map(principle => (
        <article key={principle.title}>
          <h2>{principle.title}</h2>
          <p>{principle.body}</p>
        </article>
      ))}

      <p style={{ marginTop: 28 }}>
        <Link href="/?view=dashboard">Return to {BRAND.productShortName}</Link>
      </p>
    </main>
  );
}
