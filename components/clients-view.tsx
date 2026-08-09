"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import {
  IdentityButton,
  IdentityEmptyState,
  IdentityPageHeader,
} from "@/components/identity";
import { PersonRow } from "@/components/people/person-row";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import { identityEmptyStates } from "@/lib/identity-language";
import {
  getPeopleNextActionLabel,
  sortClientsByAttention,
} from "@/lib/people/attention-order";
import { getRelationshipDisplayName, relationshipPublicIdentity } from "@/lib/relationship-identity";
import { getConciseDevelopmentFocus } from "@/lib/people/development-focus-display";
import { apiJson } from "@/lib/api-client";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

export type ClientsListFilter = "active" | "archived" | "all";

export function ClientsView({
  clients,
  onOpen,
  onAdd,
  creating = false,
  flashMessage = "",
}: {
  clients: Client[];
  onOpen: (client: Client) => void;
  onAdd: () => void;
  creating?: boolean;
  flashMessage?: string;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<ClientsListFilter>("active");
  const [privateMatchIds, setPrivateMatchIds] = useState<string[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPrivateMatchIds([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await apiJson<{
            results: Array<{ id: string }>;
          }>(`/api/clients/search?q=${encodeURIComponent(q)}`, {
            method: "GET",
          });
          if (!cancelled) {
            setPrivateMatchIds(data.results.map(item => item.id));
          }
        } catch {
          if (!cancelled) setPrivateMatchIds([]);
        }
      })();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const byStatus = clients.filter(client => {
      const archived = isClientArchived(client);
      if (listFilter === "active") return !archived;
      if (listFilter === "archived") return archived;
      return true;
    });

    const lower = query.toLowerCase();
    const matched = byStatus.filter(c => {
      if (!lower) return true;
      const identity = relationshipPublicIdentity(c);
      const publicHaystack = [
        identity.displayName,
        identity.displayLabel,
        identity.confidentialReference ?? "",
        identity.role,
        identity.organisation,
        c.name,
        c.currentFocus,
      ]
        .join(" ")
        .toLowerCase();
      return publicHaystack.includes(lower) || privateMatchIds.includes(c.id);
    });

    return sortClientsByAttention(matched);
  }, [clients, query, listFilter, privateMatchIds]);

  const activeCount = clients.filter(c => !isClientArchived(c)).length;
  const archivedCount = clients.filter(c => isClientArchived(c)).length;

  return (
    <section className="page identity-reveal">
      <IdentityPageHeader
        eyebrow="People I support"
        title="People"
        description="Team members and people you support — ordered by what needs attention next."
      />

      {flashMessage ? (
        <div className="inline-success" role="status">
          <p>{flashMessage}</p>
        </div>
      ) : null}

      {clients.length > 0 ? (
        <div className="clients-filter" role="tablist" aria-label="People status filter">
          {(
            [
              { id: "active", label: "Active", count: activeCount },
              { id: "archived", label: "Archived", count: archivedCount },
              { id: "all", label: "All", count: clients.length },
            ] as const
          ).map(option => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={listFilter === option.id}
              className={`clients-filter-tab${listFilter === option.id ? " active" : ""}`}
              onClick={() => setListFilter(option.id)}
            >
              {option.label}
              <span className="clients-filter-count">{option.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="search-box">
        <Search size={19} aria-hidden />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search reference, label, organisation or purpose"
          aria-label="Search relationships"
        />
      </div>

      {clients.length === 0 ? (
        <IdentityEmptyState
          title={identityEmptyStates.noRelationships.title}
          description={identityEmptyStates.noRelationships.description}
          action={
            <IdentityButton onClick={onAdd} disabled={creating} aria-busy={creating}>
              <Plus size={17} aria-hidden /> Add first {language.personSingular}
            </IdentityButton>
          }
        />
      ) : filtered.length === 0 ? (
        <IdentityEmptyState
          title={
            listFilter === "archived"
              ? `No archived ${language.personPlural}`
              : listFilter === "active"
                ? `No active ${language.personPlural}`
                : `No matching ${language.personPlural}`
          }
          description={
            query.trim()
              ? `Try a different name, organisation or ${language.developmentPurposeLabel.toLowerCase()}.`
              : listFilter === "archived"
                ? `Archived ${language.personPlural} will appear here when you archive someone from Journey.`
                : `Switch to Archived or All to see other ${language.personPlural}.`
          }
        />
      ) : (
        <ul className="identity-people-list">
          {filtered.map(client => {
            const archived = isClientArchived(client);
            const fullFocus = client.currentFocus?.trim() || "";
            return (
              <li key={client.id}>
                <PersonRow
                  person={{
                    id: client.id,
                    name: getRelationshipDisplayName(client),
                    role:
                      client.identityMode === "confidential" &&
                      client.confidentialReference
                        ? `${client.confidentialReference}${
                            client.role ? ` · ${client.role}` : ""
                          }`
                        : client.role,
                    organisation: client.organisation,
                    journeyStatus: archived
                      ? "Archived"
                      : coachingStatusLabel(client),
                    developmentFocus: getConciseDevelopmentFocus(fullFocus),
                    developmentFocusFull: fullFocus || undefined,
                    nextActionLabel: getPeopleNextActionLabel(client),
                  }}
                  onOpen={() => onOpen(client)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
