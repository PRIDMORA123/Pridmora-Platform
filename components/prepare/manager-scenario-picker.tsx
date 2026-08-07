"use client";

import { MANAGER_SCENARIOS, type ManagerScenario } from "@/lib/manager-scenarios";
import { BRAND } from "@/lib/brand";

export function ManagerScenarioPicker({
  selectedId,
  onSelect,
  compact = false,
}: {
  selectedId?: string | null;
  onSelect: (scenario: ManagerScenario) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={
        compact
          ? "manager-scenario-picker is-compact"
          : "manager-scenario-picker"
      }
      aria-labelledby="manager-scenario-heading"
    >
      <header className="manager-scenario-header">
        <p className="eyebrow">Conversation scenarios</p>
        <h2 id="manager-scenario-heading">
          {compact ? "What kind of conversation is this?" : "Prepare for a real management situation"}
        </h2>
        <p>
          Choose a scenario to shape preparation. The same Preparation → Conversation →
          Summary flow continues underneath. {BRAND.intelligenceName} supports thinking —
          she does not replace your judgement.
        </p>
      </header>

      <div className="manager-scenario-grid" role="list">
        {MANAGER_SCENARIOS.map(scenario => {
          const selected = selectedId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              role="listitem"
              className={
                selected
                  ? "manager-scenario-card is-selected"
                  : "manager-scenario-card"
              }
              aria-pressed={selected}
              onClick={() => onSelect(scenario)}
            >
              <strong>{scenario.label}</strong>
              {!compact ? <span>{scenario.description}</span> : null}
              {scenario.sensitivity === "elevated" ? (
                <small>Preparation and reflection support only</small>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
