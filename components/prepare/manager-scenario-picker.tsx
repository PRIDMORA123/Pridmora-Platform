"use client";

import { MANAGER_SCENARIOS, type ManagerScenario } from "@/lib/manager-scenarios";
import { BRAND } from "@/lib/brand";

/** Compact optional conversation-type selector — not a competing card wall. */
export function ManagerScenarioPicker({
  selectedId,
  onSelect,
  compact = false,
}: {
  selectedId?: string | null;
  onSelect: (scenario: ManagerScenario) => void;
  compact?: boolean;
}) {
  const selected = MANAGER_SCENARIOS.find(item => item.id === selectedId);

  return (
    <section
      className={
        compact
          ? "manager-scenario-picker is-compact is-simple"
          : "manager-scenario-picker is-simple"
      }
      aria-labelledby="manager-scenario-heading"
    >
      <header className="manager-scenario-header">
        <p className="eyebrow">Optional</p>
        <h2 id="manager-scenario-heading">
          What kind of conversation are you preparing for?
        </h2>
        <p>
          {BRAND.intelligenceName} already uses the person&apos;s development
          history. Choose a type only if it helps — selection is not required.
        </p>
      </header>

      <label className="manager-scenario-select-label">
        <span className="sr-only">Conversation type</span>
        <select
          className="manager-scenario-select"
          value={selectedId ?? ""}
          onChange={event => {
            const next = MANAGER_SCENARIOS.find(
              item => item.id === event.target.value
            );
            if (next) onSelect(next);
          }}
        >
          <option value="">
            {selected
              ? selected.label
              : "Suggested: Development conversation"}
          </option>
          {MANAGER_SCENARIOS.map(scenario => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
