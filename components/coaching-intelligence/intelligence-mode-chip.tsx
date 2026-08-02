"use client";

import { forwardRef } from "react";
import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";

export const IntelligenceModeChip = forwardRef<
  HTMLButtonElement,
  {
    mode: CoachingIntelligenceMode;
    onClick?: () => void;
  }
>(function IntelligenceModeChip({ mode, onClick }, ref) {
  const configuration = COACHING_INTELLIGENCE_MODES[mode];

  return (
    <button
      ref={ref}
      type="button"
      className={`intelligence-mode-chip is-${mode}`}
      onClick={onClick}
      aria-label={`Coaching intelligence: ${configuration.label}. View details.`}
    >
      <span aria-hidden="true" />
      <span>
        Coaching intelligence: <strong>{configuration.label}</strong>
      </span>
    </button>
  );
});
