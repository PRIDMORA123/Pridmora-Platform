"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  MembershipRole,
  Organisation,
  OrganisationMembership,
  ProfessionalRole,
} from "@/lib/organisations/types";
import { canSeeOrganisationNav } from "@/lib/organisations/permissions";
import { apiJson } from "@/lib/api-client";
import { resolvePostLoginDestination } from "@/lib/auth/post-login-destination";

export type OrganisationWorkspaceState = {
  organisation: Organisation;
  membership: OrganisationMembership;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
  organisations: Array<{
    organisation: Organisation;
    membership: OrganisationMembership;
  }>;
};

type OrganisationContextValue = OrganisationWorkspaceState & {
  showWorkspaceSelector: boolean;
  showOrganisationNav: boolean;
  switchOrganisation: (organisationId: string) => Promise<void>;
  refreshOrganisations: () => Promise<void>;
  clearRelationshipSelection: () => void;
  onClearRelationshipSelection: ((handler: () => void) => void) | null;
};

const OrganisationReactContext = createContext<OrganisationContextValue | null>(
  null
);

type ProviderProps = {
  initial: OrganisationWorkspaceState | null;
  children: ReactNode;
  onOrganisationSwitched?: () => void;
};

export function OrganisationProvider({
  initial,
  children,
  onOrganisationSwitched,
}: ProviderProps) {
  const [state, setState] = useState<OrganisationWorkspaceState | null>(initial);
  const [clearHandler, setClearHandler] = useState<(() => void) | null>(null);

  const refreshOrganisations = useCallback(async () => {
    const payload = await apiJson<{
      current: OrganisationWorkspaceState;
      organisations: OrganisationWorkspaceState["organisations"];
    }>("/api/organisations/current");

    setState({
      organisation: payload.current.organisation,
      membership: payload.current.membership,
      role: payload.current.role,
      professionalRole: payload.current.professionalRole,
      organisations: payload.organisations,
    });
  }, []);

  const switchOrganisation = useCallback(
    async (organisationId: string) => {
      if (!state || organisationId === state.organisation.id) return;

      const target = state.organisations.find(
        entry => entry.organisation.id === organisationId
      );
      if (!target) {
        throw new Error("Not an active member of that organisation.");
      }

      await apiJson("/api/organisations/current", {
        method: "POST",
        body: JSON.stringify({ organisationId }),
      });

      // Clear selected relationship before refreshing org-scoped data
      clearHandler?.();
      onOrganisationSwitched?.();

      // Hard navigation clears residual client state and lands by active membership.
      const destination = resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: target.membership.role,
        professionalRole: target.membership.professionalRole,
        organisationType: target.organisation.organisationType,
      });
      window.location.assign(destination);
    },
    [state, clearHandler, onOrganisationSwitched]
  );

  const registerClear = useCallback((handler: () => void) => {
    setClearHandler(() => handler);
  }, []);

  const value = useMemo<OrganisationContextValue | null>(() => {
    if (!state) return null;
    return {
      ...state,
      showWorkspaceSelector: state.organisations.length > 1,
      showOrganisationNav: canSeeOrganisationNav(state.role),
      switchOrganisation,
      refreshOrganisations,
      clearRelationshipSelection: () => clearHandler?.(),
      onClearRelationshipSelection: registerClear,
    };
  }, [state, switchOrganisation, refreshOrganisations, clearHandler, registerClear]);

  if (!value) {
    return <>{children}</>;
  }

  return (
    <OrganisationReactContext.Provider value={value}>
      {children}
    </OrganisationReactContext.Provider>
  );
}

export function useOrganisation(): OrganisationContextValue | null {
  return useContext(OrganisationReactContext);
}

export function useOrganisationRequired(): OrganisationContextValue {
  const ctx = useContext(OrganisationReactContext);
  if (!ctx) {
    throw new Error("Organisation context is not available.");
  }
  return ctx;
}
