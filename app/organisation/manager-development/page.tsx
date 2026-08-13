"use client";

import { useEffect, useState } from "react";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import {
  ManagerDevelopmentIntelligenceView,
  type ManagerDevelopmentLeadPayload,
} from "@/components/organisation/manager-development-intelligence-view";
import { apiJson } from "@/lib/api-client";

export default function OrganisationManagerDevelopmentPage() {
  const [data, setData] = useState<ManagerDevelopmentLeadPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<ManagerDevelopmentLeadPayload>(
          "/api/organisations/manager-development-intelligence"
        );
        if (!active) return;
        setData(payload);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Manager Development Intelligence."
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <OrganisationShell
      title="Manager Development Intelligence"
      subtitle="Organisation-level development patterns across Managers"
      eyebrow="Organisation Development"
      compactHeader
    >
      {loading ? (
        <p className="organisation-muted">
          Loading Manager Development Intelligence…
        </p>
      ) : null}
      {error ? <p className="organisation-error">{error}</p> : null}
      {data ? (
        <ManagerDevelopmentIntelligenceView data={data} variant="full" />
      ) : null}
    </OrganisationShell>
  );
}
