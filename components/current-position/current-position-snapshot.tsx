"use client";

import { useState } from "react";
import type { CurrentPositionCardModel } from "@/lib/coaching-journey";

export function CurrentPositionSnapshot({
  model,
}: {
  model: CurrentPositionCardModel;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <section className="identity-current-position" aria-labelledby="current-position-heading">
      <p className="identity-current-position__eyebrow">Current Position</p>
      <h2 id="current-position-heading" className="sr-only">
        Current Position
      </h2>
      <p className="identity-current-position__statement">{model.statement}</p>

      {model.hasDetail ? (
        <button
          type="button"
          className="identity-text-action"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen(open => !open)}
        >
          {detailOpen ? "Hide detail" : "View detail"}
        </button>
      ) : null}

      {detailOpen && model.fullNarrative ? (
        <p className="identity-current-position__detail">{model.fullNarrative}</p>
      ) : null}

      <div className="identity-current-position__details">
        <div>
          <p className="identity-current-position__label">Current focus</p>
          <p className="identity-current-position__value">{model.currentFocus}</p>
        </div>
        <div>
          <p className="identity-current-position__label">Next conversation</p>
          <p className="identity-current-position__value">{model.nextConversation}</p>
        </div>
        <div>
          <p className="identity-current-position__label">Outstanding commitment</p>
          <p className="identity-current-position__value">
            {model.outstandingCommitment}
          </p>
        </div>
      </div>
    </section>
  );
}
