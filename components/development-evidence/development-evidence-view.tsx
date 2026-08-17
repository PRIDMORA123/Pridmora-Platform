"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IdentityBackLink } from "@/components/identity";
import { EvidenceConfidencePanel } from "@/components/development-evidence/evidence-confidence-panel";
import { MyDevelopmentSubnav } from "@/components/my-development-subnav";
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
import { EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY } from "@/lib/organisations/manager-privacy-visibility-copy";
import {
  SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY,
  SENSITIVE_INFO_EVIDENCE_PURPOSE_STEP_COPY,
  SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY,
} from "@/lib/organisations/sensitive-information-guidance";
import type { Client } from "@/lib/types";

const UPLOAD_REQUEST_TIMEOUT_MS = 25_000;
const ANALYSE_REQUEST_TIMEOUT_MS = 25_000;

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
  observationSourceEvidence?: Array<{
    observationId: string;
    excerpt: string | null;
    matchKind: "exact_behavioural" | "derived" | "none";
    sourceLabel: string;
  }>;
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
  myDevelopmentNav,
}: {
  client: Client;
  onBack: () => void;
  onOpenIntelligence?: () => void;
  /** Manager self-development navigation only — never for managed people. */
  myDevelopmentNav?: {
    onOpenOverview: () => void;
    onOpenReflection: () => void;
    onOpenEvidence: () => void;
    onOpenIntelligence: () => void;
  };
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
  const uploadPanelRef = useRef<HTMLElement | null>(null);
  const [progressLabel, setProgressLabel] = useState("");

  const displayName = getRelationshipDisplayName(client);
  // Only rendered when the parent explicitly supplies My Development nav
  // (home-app self-evidence path). Managed-person evidence never passes this.
  const showMyDevelopmentSubnav = Boolean(myDevelopmentNav);

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
    for (const observation of data.observations ?? []) {
      next[observation.id] = {
        title: observation.title,
        description: observation.description,
        include: observation.reviewStatus !== "rejected",
      };
    }
    setEditMap(next);
  }

  /**
   * Open the review gate for an existing pending item.
   * Must load detail before review controls render; failures must surface.
   */
  async function openReviewForEvidence(evidenceId: string) {
    setAdding(true);
    setActiveEvidenceId(evidenceId);
    setDetail(null);
    setEditMap({});
    setStep("review");
    setError("");
    setBusy(true);
    requestAnimationFrame(() => {
      uploadPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    try {
      await loadDetail(evidenceId);
    } catch (err) {
      setError(errorMessage(err, "Unable to load evidence for review."));
    } finally {
      setBusy(false);
    }
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
    // Stay on purpose until upload succeeds — do not pretend analysis has started.

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
      window.clearTimeout(uploadTimeoutId);

      if (uploadJson.needsManualText) {
        setProgressLabel("");
        setStep("analyse");
        throw new Error(
          uploadJson.error ||
            "Text could not be extracted. Your evidence record was saved — try a text-based PDF or plain text file, then retry analysis if text becomes available."
        );
      }

      await runAnalyseForEvidence(createdEvidenceId);
      setProgressLabel("");
      void load();
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
      if (createdEvidenceId) {
        setStep("analyse");
      }
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
      if (decision === "approve" && onOpenIntelligence) {
        onOpenIntelligence();
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to save review."));
    } finally {
      setBusy(false);
    }
  }

  function evidenceNextStepLabel(item: EvidenceListItem): string {
    if (item.processingStatus === "failed") {
      return "Analysis failed — open to retry";
    }
    if (
      item.processingStatus === "pending_upload" ||
      item.processingStatus === "uploaded" ||
      item.processingStatus === "extracting" ||
      item.processingStatus === "extracted" ||
      item.processingStatus === "analysing"
    ) {
      return "Analysis pending";
    }
    if (
      item.reviewStatus === "pending_review" ||
      item.reviewStatus === "in_review"
    ) {
      return "Ready for your review";
    }
    if (item.includeInIntelligence) {
      return "Included in Development Intelligence";
    }
    return "Reviewed";
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

      {showMyDevelopmentSubnav && myDevelopmentNav ? (
        <MyDevelopmentSubnav
          active="evidence"
          onOpenOverview={myDevelopmentNav.onOpenOverview}
          onOpenReflection={myDevelopmentNav.onOpenReflection}
          onOpenEvidence={myDevelopmentNav.onOpenEvidence}
          onOpenIntelligence={myDevelopmentNav.onOpenIntelligence}
        />
      ) : null}

      <section className="panel evidence-orientation">
        <div className="evidence-orientation__block">
          <h2 className="identity-subheading">What is this?</h2>
          <p>
            Evidence that contributes to understanding development. Approved
            observations inform Development Intelligence for {displayName}.{" "}
            {SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY}
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
        <section
          ref={uploadPanelRef}
          className="panel evidence-upload-panel"
          data-testid="evidence-upload-panel"
        >
          <p className="card-label">
            {step === "review" ? "Review evidence" : "Add evidence"}
          </p>
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
              <p
                className="muted"
                data-testid="evidence-upload-data-minimisation"
              >
                {SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY}
              </p>
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
                  disabled={busy}
                />
              </label>
              <p className="muted">
                Uploaded documents are interpreted as development evidence. This
                is not a formal integration with assessment providers.{" "}
                {SENSITIVE_INFO_EVIDENCE_PURPOSE_STEP_COPY}
              </p>
              {busy && progressLabel ? (
                <p className="muted" aria-live="polite">
                  {progressLabel}
                </p>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !purpose.trim()}
                  onClick={() => void uploadAndAnalyse()}
                >
                  {busy ? "Uploading…" : "Analyse"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
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

          {step === "review" ? (
            <div data-testid="evidence-review-panel">
              {busy && !detail ? (
                <p
                  className="muted"
                  aria-live="polite"
                  data-testid="evidence-review-loading"
                >
                  Loading observations for review…
                </p>
              ) : null}
              {!busy && !detail && error ? (
                <p className="muted" data-testid="evidence-review-unavailable">
                  Review could not be opened. See the message above, then try
                  again.
                </p>
              ) : null}
              {detail ? (
                <>
                  <p className="muted">
                    No uploaded evidence changes Development Intelligence until
                    you approve it. {EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY}
                  </p>
                  {(detail.observations ?? []).length === 0 ? (
                    <p className="muted" data-testid="evidence-review-empty">
                      No observations are available to review yet. Retry
                      analysis if extraction did not complete, or reject this
                      evidence.
                    </p>
                  ) : (
                    <>
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
                          const sourceEvidence =
                            detail.observationSourceEvidence?.find(
                              item => item.observationId === observation.id
                            ) ?? null;
                          return (
                            <li
                              key={observation.id}
                              className="evidence-observation-card"
                            >
                              <label className="checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={edited?.include ?? false}
                                  onChange={event =>
                                    setEditMap(current => ({
                                      ...current,
                                      [observation.id]: {
                                        title:
                                          edited?.title ?? observation.title,
                                        description:
                                          edited?.description ??
                                          observation.description,
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
                                          edited?.description ??
                                          observation.description,
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
                                  value={
                                    edited?.description ??
                                    observation.description
                                  }
                                  onChange={event =>
                                    setEditMap(current => ({
                                      ...current,
                                      [observation.id]: {
                                        title:
                                          edited?.title ?? observation.title,
                                        description: event.target.value,
                                        include: edited?.include ?? true,
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <div className="field">
                                <span>Supporting evidence</span>
                                {sourceEvidence?.excerpt ? (
                                  <>
                                    <p className="evidence-observation-source-excerpt">
                                      {sourceEvidence.excerpt}
                                    </p>
                                    <p className="muted">
                                      Source: {sourceEvidence.sourceLabel}
                                    </p>
                                  </>
                                ) : (
                                  <p className="muted">
                                    No verified source excerpt available
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  <div className="button-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || (detail.observations ?? []).length === 0}
                      onClick={() => void submitReview("approve")}
                      data-testid="evidence-review-approve"
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
            </div>
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
                    {evidenceNextStepLabel(item)} · Processing:{" "}
                    {item.processingStatus.replaceAll("_", " ")} · Review:{" "}
                    {item.reviewStatus.replaceAll("_", " ")} ·{" "}
                    {item.freshnessLabel}
                  </p>
                </div>
                <div className="button-row">
                  {item.processingStatus === "failed" && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setAdding(true);
                        setActiveEvidenceId(item.id);
                        setStep("analyse");
                        setError(
                          "Analysis did not complete. Retry analysis, or replace the file with a text-based PDF or plain-text summary."
                        );
                        void loadDetail(item.id);
                      }}
                    >
                      Retry analysis
                    </button>
                  )}
                  {(item.reviewStatus === "pending_review" ||
                    item.reviewStatus === "in_review") && (
                    <button
                      type="button"
                      className="secondary"
                      data-testid={`evidence-review-open-${item.id}`}
                      disabled={busy}
                      onClick={() => {
                        void openReviewForEvidence(item.id);
                      }}
                    >
                      Review
                    </button>
                  )}
                  {item.includeInIntelligence && onOpenIntelligence ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={onOpenIntelligence}
                    >
                      View development intelligence
                    </button>
                  ) : null}
                </div>
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
