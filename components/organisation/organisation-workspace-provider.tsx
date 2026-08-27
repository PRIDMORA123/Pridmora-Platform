"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiJson } from "@/lib/api-client";
import {
  OrganisationProvider,
  type OrganisationWorkspaceState,
} from "@/lib/organisations/organisation-context";

/**
 * Client bootstrap for Organisation Workspace so WorkspaceSelector / account
 * chrome can use the same OrganisationProvider model as Manager AppShell.
 * Soft-fails (renders children without provider) when org context is unavailable
 * — e.g. invitation accept before a session exists.
 */
export function OrganisationWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [initial, setInitial] = useState<OrganisationWorkspaceState | null>(
    null
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await apiJson<{
          current: OrganisationWorkspaceState;
          organisations: OrganisationWorkspaceState["organisations"];
        }>("/api/organisations/current");
        if (cancelled) return;
        setInitial({
          organisation: payload.current.organisation,
          membership: payload.current.membership,
          role: payload.current.role,
          professionalRole: payload.current.professionalRole,
          isSampleOrganisation: payload.current.isSampleOrganisation,
          organisations: payload.organisations,
        });
      } catch {
        if (!cancelled) setInitial(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <>{children}</>;
  }

  return (
    <OrganisationProvider initial={initial}>{children}</OrganisationProvider>
  );
}
