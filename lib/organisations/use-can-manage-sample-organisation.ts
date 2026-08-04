"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import {
  canManageSampleOrganisation,
  parseMembershipRole,
} from "@/lib/organisations/permissions";

/**
 * Resolves sample_organisation.manage for the current workspace.
 * Uses OrganisationProvider when present; otherwise loads role from the
 * server-derived organisation context API so organisation admin routes and
 * Settings still show the link outside the home-app provider.
 */
export function useCanManageSampleOrganisation(): boolean {
  const organisation = useOrganisation();
  const [fallbackAllowed, setFallbackAllowed] = useState(false);

  useEffect(() => {
    if (organisation) {
      setFallbackAllowed(canManageSampleOrganisation(organisation.role));
      return;
    }

    let cancelled = false;
    apiJson<{
      current?: { role?: string; canManageSampleOrganisation?: boolean };
    }>("/api/organisations/current")
      .then(payload => {
        if (cancelled) return;
        if (typeof payload.current?.canManageSampleOrganisation === "boolean") {
          setFallbackAllowed(payload.current.canManageSampleOrganisation);
          return;
        }
        const role = parseMembershipRole(payload.current?.role);
        setFallbackAllowed(role ? canManageSampleOrganisation(role) : false);
      })
      .catch(() => {
        if (!cancelled) setFallbackAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organisation]);

  if (organisation) {
    return canManageSampleOrganisation(organisation.role);
  }

  return fallbackAllowed;
}
