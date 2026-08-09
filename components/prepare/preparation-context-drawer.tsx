"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  getContextTitle,
  type PreparationContextSection,
  type PreparationIntelligenceViewModel,
} from "@/lib/preparation-intelligence";
import { CoachingGuidance } from "@/components/prepare/coaching-guidance";

function PreparationContextContent({
  section,
  intelligence,
  onInsertQuestion,
}: {
  section: PreparationContextSection;
  intelligence: PreparationIntelligenceViewModel;
  onInsertQuestion?: (question: string) => void;
}) {
  if (section === "preparation_brief") {
    return (
      <div className="preparation-brief">
        <p className="preparation-brief-notice">
          Suggested preparation support based on approved coaching evidence.
          Review and adapt before the conversation.
        </p>

        {intelligence.previousConversation ? (
          <section className="context-narrative-section">
            <h3>Previous position</h3>
            <p>{intelligence.previousConversation.summary}</p>
          </section>
        ) : (
          <section className="preparation-brief-state">
            <h3>This is the first conversation in this relationship</h3>
            <p>
              Preparation guidance will use the agreed development purpose and any
              existing development evidence.
            </p>
          </section>
        )}

        {intelligence.outstandingCommitments.length > 0 ? (
          <section className="context-list-section">
            <h3>Open commitments</h3>
            <ul>
              {intelligence.outstandingCommitments.map(item => (
                <li key={item.id}>{item.statement}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {intelligence.suggestedFocus ? (
          <section className="context-narrative-section">
            <h3>Possible areas to explore</h3>
            <p>{intelligence.suggestedFocus}</p>
          </section>
        ) : null}

        {intelligence.suggestedQuestions.length > 0 ? (
          <section className="context-list-section">
            <h3>Questions to consider</h3>
            <ul>
              {intelligence.suggestedQuestions.map(question => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  if (section === "previous_conversation") {
    if (!intelligence.previousConversation) {
      return (
        <div className="preparation-brief-state">
          <h3>This is the first conversation in this relationship</h3>
          <p>
            Preparation guidance will use the agreed development purpose and any
            existing development evidence.
          </p>
        </div>
      );
    }

    return (
      <div className="context-detail-block">
        <p className="context-detail-meta">
          {intelligence.previousConversation.completedAt || "Date not set"}
          {intelligence.previousConversation.focus
            ? ` · ${intelligence.previousConversation.focus}`
            : ""}
        </p>
        <section>
          <h3>Summary</h3>
          <p>{intelligence.previousConversation.summary}</p>
        </section>
        {intelligence.previousConversation.agreedOutcomes ? (
          <section>
            <h3>Agreed outcomes</h3>
            <p>{intelligence.previousConversation.agreedOutcomes}</p>
          </section>
        ) : null}
      </div>
    );
  }

  if (section === "commitments") {
    if (intelligence.outstandingCommitments.length === 0) {
      return (
        <div className="preparation-brief-state">
          <h3>No unresolved commitments</h3>
          <p>There are no open actions recorded for this relationship.</p>
        </div>
      );
    }

    return (
      <ul className="context-commitment-list">
        {intelligence.outstandingCommitments.map(item => (
          <li key={item.id}>
            <strong>{item.statement}</strong>
            <span>{item.dueDate ? `Due ${item.dueDate}` : "Open"}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (section === "reflection") {
    if (!intelligence.recentReflection) {
      return (
        <div className="preparation-brief-state">
          <h3>No approved reflection available</h3>
          <p>
            Approved reflections that are shareable for coaching use will appear
            here.
          </p>
        </div>
      );
    }

    return (
      <div className="context-detail-block">
        <p className="context-suggested-note">
          Approved reflection content only. Private coaching notes are not shown.
        </p>
        <p>{intelligence.recentReflection.summary}</p>
      </div>
    );
  }

  if (section === "development") {
    if (intelligence.developmentUpdates.length === 0) {
      return (
        <div className="preparation-brief-state">
          <h3>No approved development updates yet</h3>
          <p>
            Approved development changes will appear here as the coaching
            journey progresses.
          </p>
        </div>
      );
    }

    return (
      <div className="context-detail-block">
        <section>
          <h3>Approved development updates</h3>
          <ul>
            {intelligence.developmentUpdates.map(update => (
              <li key={update.id}>
                <strong>{update.title}</strong>
                <p>{update.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <CoachingGuidance
      guidance={{
        questions: intelligence.suggestedQuestions,
        approachSummary:
          intelligence.approachSummary ||
          "Reconnect with the development purpose and choose one useful area to explore.",
        framework: intelligence.suggestedFramework,
      }}
      onInsertQuestion={question => onInsertQuestion?.(question)}
    />
  );
}

export type PreparationRelationshipSummary = {
  stage: string;
  focus: string;
  latestConversation: string;
  preparationApproach?: string;
};

export function PreparationContextDrawer({
  section,
  intelligence,
  relationshipSummary,
  onClose,
  triggerRef,
  onInsertQuestion,
}: {
  section: PreparationContextSection | null;
  intelligence: PreparationIntelligenceViewModel;
  relationshipSummary?: PreparationRelationshipSummary;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  onInsertQuestion?: (question: string) => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!section) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => triggerRef?.current?.focus());
    };
  }, [section, onClose, triggerRef]);

  if (!section || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        className="context-drawer-overlay"
        onClick={onClose}
        aria-label="Close preparation context"
      />

      <aside
        ref={drawerRef}
        className="preparation-context-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="context-drawer-header">
          <div>
            <p className="prepare-eyebrow">Development intelligence</p>
            <h2 id={titleId}>{getContextTitle(section)}</h2>
          </div>

          <button
            type="button"
            className="context-drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="context-drawer-content">
          {relationshipSummary ? (
            <section
              className="prepare-relationship-summary"
              aria-label="Relationship summary"
            >
              <p className="prepare-eyebrow">Relationship</p>
              <dl>
                <div>
                  <dt>Current stage</dt>
                  <dd>{relationshipSummary.stage}</dd>
                </div>
                <div>
                  <dt>Current focus</dt>
                  <dd>{relationshipSummary.focus}</dd>
                </div>
                <div>
                  <dt>Latest conversation</dt>
                  <dd>{relationshipSummary.latestConversation}</dd>
                </div>
                {relationshipSummary.preparationApproach ? (
                  <div>
                    <dt>Preparation approach</dt>
                    <dd>{relationshipSummary.preparationApproach}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <PreparationContextContent
            section={section}
            intelligence={intelligence}
            onInsertQuestion={onInsertQuestion}
          />
        </div>
      </aside>
    </>,
    document.body
  );
}
