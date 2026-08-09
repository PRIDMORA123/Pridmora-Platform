"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IdentityBackLink } from "@/components/identity";
import { EvidenceConfidencePanel } from "@/components/development-evidence/evidence-confidence-panel";
import { apiJson, errorMessage } from "@/lib/api-client";
import {
  MAX_UPLOAD_BYTES,
  type DevelopmentEvidenceObservation,
  type DevelopmentEvidenceRecord,
  type EvidenceConfidenceResult,
  type EvidenceCoverageResult,
  type EvidenceListItem,
} from "@/lib/development-evidence";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";
import type { Client } from "@/lib/types";

const UPLOAD_REQUEST_TIMEOUT_MS = 30_000;
const ANALYSE_REQUEST_TIMEOUT_MS = 35_000;

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" || /aborted|timed out/i.test(error.message)))
  );
}

type UploadableType = { value: string; label: string };

type ListPayload = {
  items: EvidenceListItem[];
  confidence: EvidenceConfidenceResult;
  coverage: EvidenceCoverageResult;
  uploadableTypes: UploadableType[];
};

type DetailPayload = {
  evidence: DevelopmentEvidenceRecord;
  observations: DevelopmentEvidenceObservation[];
  document: { id: string; fileName: string; hasExtractedText: boolean } | null;
};

const STEPS = [
  "type",
  "upload",
  "purpose",
  "analyse",
  "review",
] as const;

export function DevelopmentEvidenceView({
  client,
  onBack,
  onOpenIntelligence,
}: {
  client: Client;
  onBack: () => void;
  onOpenIntelligence?: () => void;
}) {
  const [items, setItems] = useState<EvidenceListItem[]>([]);
  const [confidence, setConfidence] = useState<EvidenceConfidenceResult | null>(
    null
  );
  const [coverage, setCoverage] = useState<EvidenceCoverageResult | null>(null);
  const [uploadableTypes, setUploadableTypes] = useState<UploadableType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<(typeof STEPS)[number]>("type");
  const [evidenceType, setEvidenceType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [evidenceDate, setEvidenceDate] = useState("");
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [editMap, setEditMap] = useState<
    Record<string, { title: string; description: string; include: boolean }>
  >({});
  const uploadInFlightRef = useRef(false);
  const [progressLabel, setProgressLabel] = useState("");

  const displayName = getRelationshipDisplayName(client);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<ListPayload>(
        `/api/development-evidence/${client.id}`
      );
      setItems(data.items ?? []);
      setConfidence(data.confidence);
      setCoverage(data.coverage);
      setUploadableTypes(data.uploadableTypes ?? []);
    } catch (err) {
      setError(errorMessage(err, "Unable to load development evidence."));
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingReview = useMemo(
    () =>
      items.filter(
        item =>
          item.reviewStatus === "pending_review" ||
          item.reviewStatus === "in_review"
      ),
    [items]
  );

  async function loadDetail(evidenceId: string) {
    const data = await apiJson<DetailPayload>(
      `/api/development-evidence/item/${evidenceId}`
    );
    setDetail(data);
    const next: Record<
      string,
      { title: string; description: string; include: boolean }
    > = {};
    for (const observation of data.observations) {
      next[observation.id] = {
        title: observation.title,
        description: observation.description,
        include: observation.reviewStatus !== "rejected",
      };
    }
    setEditMap(next);
  }

  async function runAnalyseForEvidence(evidenceId: string) {
    setProgressLabel("Analysing evidence…");
    setStep("analyse");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      ANALYSE_REQUEST_TIMEOUT_MS
    );
    try {
      await apiJson(`/api/development-evidence/item/${evidenceId}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      await loadDetail(evidenceId);
      setStep("review");
      await load();
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function uploadAndAnalyse() {
    if (!file || !evidenceType || uploadInFlightRef.current) return;
    if (!purpose.trim()) {
      setError("Add a short purpose before analysing this evidence.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Files larger than 10 MB are not supported.");
      return;
    }

    uploadInFlightRef.current = true;
    setBusy(true);
    setError("");
    setProgressLabel("Uploading evidence…");
    setStep("analyse");

    const uploadController = new AbortController();
    const uploadTimeoutId = window.setTimeout(
      () => uploadController.abort(),
      UPLOAD_REQUEST_TIMEOUT_MS
    );
    let createdEvidenceId: string | null = null;

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("evidenceType", evidenceType);
      form.set("title", file.name);
      form.set("purpose", purpose.trim());
      if (evidenceDate) form.set("evidenceDate", evidenceDate);

      const uploadResponse = await fetch(
        `/api/development-evidence/${client.id}/upload`,
        { method: "POST", body: form, signal: uploadController.signal }
      );

      let uploadJson: {
        evidence?: DevelopmentEvidenceRecord;
        error?: string;
        needsManualText?: boolean;
      } = {};
      try {
        uploadJson = (await uploadResponse.json()) as typeof uploadJson;
      } catch {
        throw new Error(
          uploadResponse.ok
            ? "Upload succeeded but returned an unreadable response."
            : `Upload failed (${uploadResponse.status}).`
        );
      }

      if (!uploadResponse.ok || !uploadJson.evidence) {
        throw new Error(uploadJson.error || "Upload failed.");
      }

      createdEvidenceId = uploadJson.evidence.id;
      setActiveEvidenceId(createdEvidenceId);
      await load();

      if (uploadJson.needsManualText) {
        setProgressLabel("");
        throw new Error(
          uploadJson.error ||
            "Text could not be extracted. Your evidence record was saved — try a text-based PDF or plain text file."
        );
      }

      await runAnalyseForEvidence(createdEvidenceId);
      setProgressLabel("");
    } catch (err) {
      if (isAbortError(err)) {
        setError(
          createdEvidenceId
            ? "Analysis timed out. Your uploaded evidence was saved — retry analysis without re-uploading."
            : "Evidence upload timed out. Check the file size and try again."
        );
      } else {
        setError(errorMessage(err, "Unable to process evidence."));
      }
      setProgressLabel("");
      setStep("analyse");
    } finally {
      window.clearTimeout(uploadTimeoutId);
      uploadInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function retryAnalyse() {
    if (!activeEvidenceId || uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    setBusy(true);
    setError("");
    try {
      await runAnalyseForEvidence(activeEvidenceId);
      setProgressLabel("");
    } catch (err) {
      if (isAbortError(err)) {
        setError(
          "Analysis timed out. Your uploaded evidence was saved — retry analysis without re-uploading."
        );
      } else {
        setError(errorMessage(err, "Unable to analyse evidence."));
      }
      setProgressLabel("");
      setStep("analyse");
    } finally {
      uploadInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function submitReview(decision: "approve" | "reject" | "exclude") {
    if (!activeEvidenceId || !detail) return;
    setBusy(true);
    setError("");
    try {
      const observationDecisions = detail.observations.map(observation => {
        const edited = editMap[observation.id];
        const include = edited?.include ?? false;
        return {
          observationId: observation.id,
          reviewStatus: include
            ? edited?.title !== observation.title ||
              edited?.description !== observation.description
              ? ("edited" as const)
              : ("approved" as const)
            : ("excluded" as const),
          title: edited?.title,
          description: edited?.description,
          includeInIntelligence: include && decision === "approve",
        };
      });

      await apiJson(`/api/development-evidence/item/${activeEvidenceId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          includeInIntelligence: decision === "approve",
          observationDecisions,
        }),
      });

      setAdding(false);
      setStep("type");
      setActiveEvidenceId(null);
      setDetail(null);
      setFile(null);
      setPurpose("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to save review."));
    } finally {
      setBusy(false);
    }
  }

  function setAllObservations(include: boolean) {
    setEditMap(current => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key]!, include };
      }
      return next;
    });
  }

  return (
    <section className="page identity-reveal">
      <IdentityBackLink onClick={onBack}>{`Back to ${displayName}`}</IdentityBackLink>

      <div className="page-heading">
        <p className="eyebrow">Development Evidence</p>
        <h1>Development Evidence</h1>
        <p>
          Evidence that contributes to understanding development — not a
          document library.
        </p>
      </div>

      <section className="panel evidence-orientation">
        <div className="evidence-orientation__block">
          <h2 className="identity-subheading">What is this?</h2>
          <p>
            Evidence that contributes to understanding development. Approved
            observations inform Development Intelligence for {displayName}.
          </p>
        </div>
        <div className="evidence-orientation__block">
          <h2 className="identity-subheading">What can I add?</h2>
          <p>
            360 feedback, DISC, Insights Discovery, CliftonStrengths, Hogan,
            Lumina, MBTI where supplied, leadership assessments, PDP, feedback,
            reflections, learning records, competency assessments, and other
            development documents.
          </p>
        </div>
        <div className="evidence-orientation__block">
          <h2 className="identity-subheading">What happens next?</h2>
          <p>
            Aurelia extracts development observations. You review them. Only
            approved evidence contributes to intelligence.
          </p>
        </div>
      </section>

      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {confidence && coverage ? (
        <EvidenceConfidencePanel confidence={confidence} coverage={coverage} />
      ) : null}

      <div className="button-row" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setAdding(true);
            setStep("type");
            setError("");
          }}
        >
          Add evidence
        </button>
        {onOpenIntelligence ? (
          <button
            type="button"
            className="secondary"
            onClick={onOpenIntelligence}
          >
            Open Development Intelligence
          </button>
        ) : null}
      </div>

      {adding ? (
        <section className="panel evidence-upload-panel">
          <p className="card-label">Add evidence</p>
          <h2 className="identity-subheading">
            {step === "type" && "Choose evidence type"}
            {step === "upload" && "Upload document"}
            {step === "purpose" && "Confirm purpose"}
            {step === "analyse" && "Analyse"}
            {step === "review" && "Review extracted evidence"}
          </h2>

          {step === "type" ? (
            <>
              <label className="field">
                <span>Evidence type</span>
                <select
                  value={evidenceType}
                  onChange={event => setEvidenceType(event.target.value)}
                >
                  <option value="">Select type</option>
                  {uploadableTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={!evidenceType}
                  onClick={() => setStep("upload")}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : null}

          {step === "upload" ? (
            <>
              <label className="field">
                <span>Document (PDF, DOCX or plain text)</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="field">
                <span>Evidence date</span>
                <input
                  type="date"
                  value={evidenceDate}
                  onChange={event => setEvidenceDate(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={!file}
                  onClick={() => setStep("purpose")}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep("type")}
                >
                  Back
                </button>
              </div>
            </>
          ) : null}

          {step === "purpose" ? (
            <>
              <label className="field">
                <span>Why is this being added?</span>
                <textarea
                  rows={3}
                  value={purpose}
                  onChange={event => setPurpose(event.target.value)}
                  placeholder="For example: support development planning after a recent 360."
                />
              </label>
              <p className="muted">
                Uploaded documents are interpreted as development evidence. This
                is not a formal integration with assessment providers.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !purpose.trim()}
                  onClick={() => void uploadAndAnalyse()}
                >
                  {busy ? "Working…" : "Analyse"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep("upload")}
                >
                  Back
                </button>
              </div>
            </>
          ) : null}

          {step === "analyse" ? (
            <>
              <p className="muted" aria-live="polite">
                {busy
                  ? progressLabel ||
                    "Aurelia is proposing observations for review…"
                  : activeEvidenceId
                    ? "Upload saved. Analysis did not finish — retry without re-uploading the file."
                    : "Upload did not complete. Go back and try again."}
              </p>
              {!busy ? (
                <div className="button-row">
                  {activeEvidenceId ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void retryAnalyse()}
                    >
                      Retry analysis
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setStep(activeEvidenceId ? "purpose" : "upload");
                      setError("");
                    }}
                  >
                    Back
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {step === "review" && detail ? (
            <>
              <p className="muted">
                No uploaded evidence changes Development Intelligence until you
                approve it.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAllObservations(true)}
                >
                  Include all
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAllObservations(false)}
                >
                  Exclude all
                </button>
              </div>
              <ul className="evidence-observation-list">
                {detail.observations.map(observation => {
                  const edited = editMap[observation.id];
                  return (
                    <li key={observation.id} className="evidence-observation-card">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={edited?.include ?? false}
                          onChange={event =>
                            setEditMap(current => ({
                              ...current,
                              [observation.id]: {
                                title: edited?.title ?? observation.title,
                                description:
                                  edited?.description ?? observation.description,
                                include: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>Include observation</span>
                      </label>
                      <label className="field">
                        <span>Title</span>
                        <input
                          value={edited?.title ?? observation.title}
                          onChange={event =>
                            setEditMap(current => ({
                              ...current,
                              [observation.id]: {
                                title: event.target.value,
                                description:
                                  edited?.description ?? observation.description,
                                include: edited?.include ?? true,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Observation</span>
                        <textarea
                          rows={3}
                          value={edited?.description ?? observation.description}
                          onChange={event =>
                            setEditMap(current => ({
                              ...current,
                              [observation.id]: {
                                title: edited?.title ?? observation.title,
                                description: event.target.value,
                                include: edited?.include ?? true,
                              },
                            }))
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void submitReview("approve")}
                >
                  Approve evidence
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void submitReview("exclude")}
                >
                  Exclude
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void submitReview("reject")}
                >
                  Reject
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <p className="card-label">Evidence base</p>
        <h2 className="identity-subheading">Extracted developmental meaning</h2>
        {loading ? (
          <p className="muted">Loading evidence…</p>
        ) : items.length === 0 ? (
          <div className="evidence-empty-state">
            <p>
              No development evidence has been added yet. Start with a
              conversation summary, reflection or uploaded document such as 360
              feedback or a leadership assessment.
            </p>
          </div>
        ) : (
          <ul className="evidence-record-list">
            {items.map(item => (
              <li key={item.id} className="evidence-record-card">
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">
                    {item.evidenceTypeLabel}
                    {item.evidenceDate ? ` · ${item.evidenceDate}` : ""}
                    {item.sourceLabel ? ` · ${item.sourceLabel}` : ""}
                  </p>
                  <p className="evidence-record-card__meta">
                    Processing: {item.processingStatus.replaceAll("_", " ")} ·
                    Review: {item.reviewStatus.replaceAll("_", " ")} ·{" "}
                    {item.includeInIntelligence
                      ? "Included in intelligence"
                      : "Excluded from intelligence"}{" "}
                    · {item.freshnessLabel}
                  </p>
                </div>
                {(item.reviewStatus === "pending_review" ||
                  item.reviewStatus === "in_review") && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setAdding(true);
                      setActiveEvidenceId(item.id);
                      setStep("review");
                      void loadDetail(item.id);
                    }}
                  >
                    Review
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {pendingReview.length > 0 ? (
          <p className="muted" style={{ marginTop: "1rem" }}>
            {pendingReview.length} item
            {pendingReview.length === 1 ? "" : "s"} awaiting review.
          </p>
        ) : null}
      </section>
    </section>
  );
}
