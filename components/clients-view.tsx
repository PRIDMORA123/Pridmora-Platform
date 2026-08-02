"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
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
import { getConciseDevelopmentFocus } from "@/lib/people/development-focus-display";

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
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<ClientsListFilter>("active");

  const filtered = useMemo(() => {
    const byStatus = clients.filter(client => {
      const archived = isClientArchived(client);
      if (listFilter === "active") return !archived;
      if (listFilter === "archived") return archived;
      return true;
    });

    const matched = byStatus.filter(c =>
      `${c.name} ${c.organisation} ${c.currentFocus}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );

    return sortClientsByAttention(matched);
  }, [clients, query, listFilter]);

  const activeCount = clients.filter(c => !isClientArchived(c)).length;
  const archivedCount = clients.filter(c => isClientArchived(c)).length;

  return (
    <section className="page identity-reveal">
      <IdentityPageHeader
        eyebrow="Workspace"
        title="People"
        description="Your developmental relationships — ordered by what needs attention next."
      />

      {flashMessage ? (
        <div className="inline-success" role="status">
          <p>{flashMessage}</p>
        </div>
      ) : null}

      {clients.length > 0 ? (
        <div className="clients-filter" role="tablist" aria-label="Client status filter">
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
          placeholder="Search name, organisation or coaching purpose"
          aria-label="Search clients"
        />
      </div>

      {clients.length === 0 ? (
        <IdentityEmptyState
          title={identityEmptyStates.noRelationships.title}
          description={identityEmptyStates.noRelationships.description}
          action={
            <IdentityButton onClick={onAdd} disabled={creating} aria-busy={creating}>
              <Plus size={17} aria-hidden /> Add first client
            </IdentityButton>
          }
        />
      ) : filtered.length === 0 ? (
        <IdentityEmptyState
          title={
            listFilter === "archived"
              ? "No archived clients"
              : listFilter === "active"
                ? "No active clients"
                : "No matching clients"
          }
          description={
            query.trim()
              ? "Try a different name, organisation or coaching purpose."
              : listFilter === "archived"
                ? "Archived clients will appear here when you archive someone from Journey."
                : "Switch to Archived or All to see other clients."
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
                    name: client.name,
                    role: client.role,
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
