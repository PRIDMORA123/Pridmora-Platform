"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IdentityBackLink } from "@/components/identity";
import type { MyDevelopmentReflectionPrefill } from "@/components/my-development-view";
import { MyDevelopmentSubnav } from "@/components/my-development-subnav";
import { apiJson, errorMessage } from "@/lib/api-client";
import type {
  MyDevelopmentReflectionDetail,
  MyDevelopmentReflectionSummary,
} from "@/lib/my-development/workspace";

/**
 * Longitudinal Manager reflection — append-only personal reflections
 * for the current organisation My Development record.
 */
export function MyDevelopmentReflectionView({
  onBack,
  onOpenIntelligence,
  onOpenEvidence,
  initialPrefill = null,
  onPrefillConsumed,
}: {
  onBack: () => void;
  onOpenIntelligence?: () => void;
  onOpenEvidence?: () => void;
  initialPrefill?: MyDevelopmentReflectionPrefill | null;
  onPrefillConsumed?: () => void;
}) {
  const [reflections, setReflections] = useState<
    MyDevelopmentReflectionSummary[]
  >([]);
  const [selected, setSelected] =
    useState<MyDevelopmentReflectionDetail | null>(null);
  const [writing, setWriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whatNoticed, setWhatNoticed] = useState("");
  const [whatWorked, setWhatWorked] = useState("");
  const [whatWasDifficult, setWhatWasDifficult] = useState("");
  const [whatDifferently, setWhatDifferently] = useState("");
  const [practiseNext, setPractiseNext] = useState("");
  const [anythingElse, setAnythingElse] = useState("");
  const prefillAppliedRef = useRef(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{
        reflections: MyDevelopmentReflectionSummary[];
      }>("/api/my-development/reflection");
      setReflections(data.reflections ?? []);
    } catch (err) {
      setError(errorMessage(err, "Unable to load reflections."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!initialPrefill || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setSelected(null);
    setWriting(true);
    setSavedMessage("");
    if (initialPrefill.title?.trim()) {
      setTitle(initialPrefill.title.trim());
    }
    if (initialPrefill.context?.trim()) {
      setContext(initialPrefill.context.trim());
    }
    onPrefillConsumed?.();
  }, [initialPrefill, onPrefillConsumed]);

  function resetForm() {
    setTitle("");
    setContext("");
    setWhatHappened("");
    setWhatNoticed("");
    setWhatWorked("");
    setWhatWasDifficult("");
    setWhatDifferently("");
    setPractiseNext("");
    setAnythingElse("");
  }

  async function openReflection(id: string) {
    setError("");
    setSavedMessage("");
    setWriting(false);
    try {
      const data = await apiJson<{ reflection: MyDevelopmentReflectionDetail }>(
        `/api/my-development/reflection/${id}`
      );
      setSelected(data.reflection);
    } catch (err) {
      setError(errorMessage(err, "Unable to open reflection."));
    }
  }

  async function submitReflection() {
    setBusy(true);
    setError("");
    setSavedMessage("");
    try {
      await apiJson("/api/my-development/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          context,
          whatHappened,
          whatNoticed,
          whatWorked,
          whatWasDifficult,
          whatDifferently,
          practiseNext,
          anythingElse,
        }),
      });
      resetForm();
      setWriting(false);
      setSelected(null);
      setSavedMessage(
        "Reflection saved. It has been added to your development picture."
      );
      await loadList();
    } catch (err) {
      setError(errorMessage(err, "Unable to save reflection."));
    } finally {
      setBusy(false);
    }
  }

  const hasAnyField = [
    context,
    whatHappened,
    whatNoticed,
    whatWorked,
    whatWasDifficult,
    whatDifferently,
    practiseNext,
    anythingElse,
  ].some(value => value.trim());

  return (
    <section className="page identity-reveal">
      <IdentityBackLink onClick={onBack}>Back to My development</IdentityBackLink>

      <div className="page-heading">
        <p className="eyebrow">My development</p>
        <h1>Reflect on my development</h1>
        <p>
          Capture dated reflections over time. Earlier reflections are kept —
          nothing is overwritten.
        </p>
      </div>

      <MyDevelopmentSubnav
        active="reflection"
        onOpenOverview={onBack}
        onOpenReflection={() => undefined}
        onOpenEvidence={() => onOpenEvidence?.()}
        onOpenIntelligence={() => onOpenIntelligence?.()}
      />

      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {savedMessage ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <p>{savedMessage}</p>
          <div className="button-row">
            <button type="button" className="primary" onClick={onBack}>
              View My Development
            </button>
            {onOpenIntelligence ? (
              <button
                type="button"
                className="secondary"
                onClick={onOpenIntelligence}
              >
                View development intelligence
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="button-row" style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setSelected(null);
            setWriting(true);
            setSavedMessage("");
          }}
        >
          New reflection
        </button>
      </div>

      {writing ? (
        <section className="panel">
          <p className="card-label">New reflection</p>
          <h2 className="identity-subheading">What do you want to capture?</h2>
          <p className="muted">All prompts are optional — complete what is useful.</p>

          <label className="field">
            <span>Title (optional)</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="e.g. After the leadership meeting"
            />
          </label>
          <label className="field">
            <span>Context (optional)</span>
            <textarea
              rows={2}
              value={context}
              onChange={event => setContext(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What happened?</span>
            <textarea
              rows={3}
              value={whatHappened}
              onChange={event => setWhatHappened(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What did I notice about myself?</span>
            <textarea
              rows={3}
              value={whatNoticed}
              onChange={event => setWhatNoticed(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What worked?</span>
            <textarea
              rows={3}
              value={whatWorked}
              onChange={event => setWhatWorked(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What was difficult?</span>
            <textarea
              rows={3}
              value={whatWasDifficult}
              onChange={event => setWhatWasDifficult(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What might I do differently?</span>
            <textarea
              rows={3}
              value={whatDifferently}
              onChange={event => setWhatDifferently(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What do I want to practise next?</span>
            <textarea
              rows={3}
              value={practiseNext}
              onChange={event => setPractiseNext(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Anything else you want to capture?</span>
            <textarea
              rows={3}
              value={anythingElse}
              onChange={event => setAnythingElse(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button
              type="button"
              className="primary"
              disabled={busy || !hasAnyField}
              onClick={() => void submitReflection()}
            >
              Save reflection
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setWriting(false);
                resetForm();
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {selected && !writing ? (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <p className="card-label">Reflection</p>
          <h2 className="identity-subheading">{selected.title}</h2>
          <p className="muted">
            {selected.evidenceDate || selected.capturedAt.slice(0, 10)}
          </p>
          {(
            [
              ["Context", selected.context],
              ["What happened", selected.whatHappened],
              ["What I noticed", selected.whatNoticed],
              ["What worked", selected.whatWorked],
              ["What was difficult", selected.whatWasDifficult],
              ["What I might do differently", selected.whatDifferently],
              ["What I want to practise next", selected.practiseNext],
              ["Anything else", selected.anythingElse],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <div key={label} style={{ marginTop: "0.75rem" }}>
                <strong>{label}</strong>
                <p>{value}</p>
              </div>
            ) : null
          )}
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(null)}
            >
              Back to history
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <p className="card-label">Reflection history</p>
        <h2 className="identity-subheading">Previous reflections</h2>
        {loading ? (
          <p className="muted">Loading reflections…</p>
        ) : reflections.length === 0 ? (
          <p className="muted">
            No reflections yet. Your first reflection becomes one source in your
            development picture — not a complete conclusion.
          </p>
        ) : (
          <ul className="evidence-record-list">
            {reflections.map(item => (
              <li key={item.id} className="evidence-record-card">
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">
                    {item.evidenceDate || item.capturedAt.slice(0, 10)}
                  </p>
                  {item.preview ? (
                    <p className="evidence-record-card__meta">{item.preview}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void openReflection(item.id)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
