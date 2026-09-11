"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { OwnerShell } from "@/components/owner/owner-shell";
import { apiJson } from "@/lib/api-client";
import {
  DEFAULT_CUSTOMER_ORG_SEATS,
  type CustomerOrgStartingRoute,
} from "@/lib/owner/create-organisation-schema";

type CreateResponse = {
  organisation: {
    id: string;
  };
};

export default function NewOwnerOrganisationPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [startingRoute, setStartingRoute] =
    useState<CustomerOrgStartingRoute>("paid_pilot");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = await apiJson<CreateResponse>("/api/owner/organisations", {
        method: "POST",
        body: JSON.stringify({
          name,
          country,
          website: website.trim() || null,
          ownerNotes: ownerNotes.trim() || null,
          seats: DEFAULT_CUSTOMER_ORG_SEATS,
          startingRoute,
        }),
      });

      router.push(`/owner/organisations/${payload.organisation.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create organisation."
      );
      setSaving(false);
    }
  }

  return (
    <OwnerShell
      title="New organisation"
      subtitle="Create a customer organisation as a Paid Pilot or optional 14-day Evaluation. Invitations are sent after the organisation has been created."
    >
      <p className="owner-muted" style={{ marginBottom: "1rem" }}>
        <Link href="/owner/organisations">← Back to organisations</Link>
      </p>

      <form className="owner-panel" onSubmit={handleSubmit}>
        <h2 className="owner-panel__title">Organisation details</h2>

        <div className="owner-filters" style={{ alignItems: "stretch" }}>
          <div className="owner-field" style={{ minWidth: "16rem", flex: 1 }}>
            <label htmlFor="owner-org-name">Organisation name</label>
            <input
              id="owner-org-name"
              required
              value={name}
              onChange={event => setName(event.target.value)}
              autoComplete="organization"
            />
          </div>

          <div className="owner-field" style={{ minWidth: "12rem", flex: 1 }}>
            <label htmlFor="owner-org-country">Country</label>
            <input
              id="owner-org-country"
              required
              value={country}
              onChange={event => setCountry(event.target.value)}
              autoComplete="country-name"
            />
          </div>
        </div>

        <div className="owner-field" style={{ marginTop: "1rem" }}>
          <span style={{ fontWeight: 600 }}>Starting route</span>

          <label
            style={{
              display: "block",
              marginTop: "0.6rem",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="starting-route"
              value="paid_pilot"
              checked={startingRoute === "paid_pilot"}
              onChange={() => setStartingRoute("paid_pilot")}
              style={{ marginRight: "0.5rem" }}
            />
            <strong>Paid Pilot</strong> — default
          </label>

          <p
            className="owner-muted"
            style={{ margin: "0.25rem 0 0 1.45rem" }}
          >
            Active immediately with Pilot plan and capacity for{" "}
            {DEFAULT_CUSTOMER_ORG_SEATS} Managers.
          </p>

          <label
            style={{
              display: "block",
              marginTop: "0.85rem",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="starting-route"
              value="evaluation"
              checked={startingRoute === "evaluation"}
              onChange={() => setStartingRoute("evaluation")}
              style={{ marginRight: "0.5rem" }}
            />
            <strong>14-day Evaluation</strong> — optional
          </label>

          <p
            className="owner-muted"
            style={{ margin: "0.25rem 0 0 1.45rem" }}
          >
            Creates a 14-day trial that can later be converted to a Paid Pilot
            without recreating the organisation.
          </p>
        </div>

        <div className="owner-field" style={{ marginTop: "1rem" }}>
          <label htmlFor="owner-org-website">Website (optional)</label>
          <input
            id="owner-org-website"
            value={website}
            onChange={event => setWebsite(event.target.value)}
            placeholder="https://"
            autoComplete="url"
          />
        </div>

        <div className="owner-field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="owner-org-notes">Notes (optional)</label>
          <textarea
            id="owner-org-notes"
            value={ownerNotes}
            onChange={event => setOwnerNotes(event.target.value)}
            rows={4}
            placeholder="Internal Platform Owner notes"
          />
        </div>

        <p className="owner-muted" style={{ marginTop: "0.75rem" }}>
          No invitation is sent in this step.
        </p>

        {error ? <p className="owner-error">{error}</p> : null}

        <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.65rem" }}>
          <button type="submit" className="owner-button" disabled={saving}>
            {saving ? "Creating…" : "Create organisation"}
          </button>

          <Link
            href="/owner/organisations"
            className="owner-button owner-button--secondary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </OwnerShell>
  );
}
