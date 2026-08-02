"use client";

import {
  PREPARATION_STYLE_OPTIONS,
  resolvePreparationStyle,
  type PreparationStyle,
} from "@/lib/preparation-style";
import { getModeLabel, preparationStyleToMode } from "@/lib/coaching-intelligence/mode";

export function PreparationStyleControl({
  coachStyle,
  clientOverride,
  disabled = false,
  compact = false,
  onChange,
}: {
  coachStyle: PreparationStyle;
  clientOverride: PreparationStyle | null;
  disabled?: boolean;
  compact?: boolean;
  onChange: (override: PreparationStyle | null) => void | Promise<void>;
}) {
  const effective = resolvePreparationStyle(coachStyle, clientOverride);
  const selected = clientOverride ?? effective;
  const defaultModeLabel = getModeLabel(preparationStyleToMode(coachStyle));

  return (
    <div className={`prep-client-style${compact ? " compact" : ""}`}>
      <div className="prep-client-style-heading">
        <p className="prep-client-style-label">Coaching intelligence level</p>
        <p className="prep-client-style-effective">
          {getModeLabel(preparationStyleToMode(effective))} support
        </p>
      </div>
      <p className="muted prep-client-style-help">
        Your default support level is <strong>{defaultModeLabel}</strong>. This
        applies only to this coaching relationship.
      </p>
      <div
        className="prep-client-style-options"
        role="radiogroup"
        aria-label="Coaching intelligence level"
      >
        {PREPARATION_STYLE_OPTIONS.map(option => {
          const checked = selected === option.value;
          return (
            <label
              key={option.value}
              className={`prep-client-style-option${checked ? " selected" : ""}`}
            >
              <input
                type="radio"
                name="client-preparation-style"
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  void onChange(option.value);
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
