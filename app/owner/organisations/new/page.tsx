"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/owner-shell";
import { apiJson } from "@/lib/api-client";
import {
  DEFAULT_CUSTOMER_ORG_SEATS,
  MAX_CUSTOMER_ORG_SEATS,
  MIN_CUSTOMER_ORG_SEATS,
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
  const [seats, setSeats] = useState(String(DEFAULT_CUSTOMER_ORG_SEATS));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const seatsNumber = Number.parseInt(seats, 10);
    if (
      !Number.isFinite(seatsNumber) ||
      seatsNumber < MIN_CUSTOMER_ORG_SEATS ||
      seatsNumber > MAX_CUSTOMER_ORG_SEATS
    ) {
      setSaving(false);
      setError(
        `Seats must be between ${MIN_CUSTOMER_ORG_SEATS} and ${MAX_CUSTOMER_ORG_SEATS}.`
      );
      return;
    }

    try {
      const payload = await apiJson<CreateResponse>("/api/owner/organisations", {
        method: "POST",
        body: JSON.stringify({
          name,
          country,
          website: website.trim() || null,
          ownerNotes: ownerNotes.trim() || null,
          seats: seatsNumber,
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
      subtitle="Create a customer organisation with a trial licence. Invitation of the first Lead or Manager comes in a later step."
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
          <div className="owner-field" style={{ minWidth: "8rem" }}>
            <label htmlFor="owner-org-seats">Seats</label>
            <input
              id="owner-org-seats"
              type="number"
              required
              min={MIN_CUSTOMER_ORG_SEATS}
              max={MAX_CUSTOMER_ORG_SEATS}
              value={seats}
              onChange={event => setSeats(event.target.value)}
            />
          </div>
        </div>

        <p className="owner-muted" style={{ marginTop: "0.5rem" }}>
          Defaults to {DEFAULT_CUSTOMER_ORG_SEATS} seats. Pilot organisations may
          use 8 or more (up to {MAX_CUSTOMER_ORG_SEATS}).
        </p>

        <div className="owner-field" style={{ marginTop: "0.75rem" }}>
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
          Creates an active organisation on a 14-day trial with licence status
          trial. No invitation is sent in this step.
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
