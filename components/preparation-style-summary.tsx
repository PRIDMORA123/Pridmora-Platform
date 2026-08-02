"use client";

import { forwardRef } from "react";
import type { PreparationStyle } from "@/lib/preparation-style";
import { PREPARATION_STYLE_LABELS } from "@/lib/preparation-style";

export type PreparationStyleSummaryProps = {
  effectiveStyle: PreparationStyle;
  isClientOverride: boolean;
  onChange: () => void;
  disabled?: boolean;
};

export const PreparationStyleSummary = forwardRef<
  HTMLButtonElement,
  PreparationStyleSummaryProps
>(function PreparationStyleSummary(
  { effectiveStyle, isClientOverride, onChange, disabled = false },
  ref
) {
  const displayPreparationStyle = PREPARATION_STYLE_LABELS[effectiveStyle];

  return (
    <section
      className="preparation-brief-meta"
      aria-label="Coaching intelligence level"
    >
      <div>
        <p className="preparation-brief-meta-label">
          Coaching intelligence level
        </p>

        <div className="preparation-brief-meta-row">
          <strong>{displayPreparationStyle} support</strong>

          <button
            ref={ref}
            type="button"
            className="identity-button is-quiet is-sm"
            onClick={onChange}
            disabled={disabled}
          >
            Change
          </button>
        </div>

        <p className="identity-supporting">
          {isClientOverride
            ? "Selected for this coaching relationship."
            : "Using your default preference."}
        </p>
      </div>
    </section>
  );
});
