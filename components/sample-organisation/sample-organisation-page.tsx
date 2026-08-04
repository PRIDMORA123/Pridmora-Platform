"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IdentityButton } from "@/components/identity/button";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { apiJson } from "@/lib/api-client";
import {
  SAMPLE_ORGANISATION_SETUP_ESTIMATE,
  SAMPLE_PROGRESS_STAGES,
  SAMPLE_STAGE_LABELS,
  type SampleInstallationView,
  type SamplePackSummary,
} from "@/lib/sample-organisations/types";

type ConfirmMode = "install" | "reset" | "remove" | null;

function formatInstalledAt(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function SampleOrganisationPage() {
  const router = useRouter();
  const [pack, setPack] = useState<SamplePackSummary | null>(null);
  const [installation, setInstallation] = useState<SampleInstallationView | null>(
    null
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [removeText, setRemoveText] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const removeInputId = useId();
  const dialogTitleId = useId();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadPack = useCallback(async () => {
    const payload = await apiJson<{ pack: SamplePackSummary }>(
      "/api/sample-organisations/northbridge-healthcare"
    );
    setPack(payload.pack);
    setInstallation(payload.pack.installation);
    return payload.pack;
  }, []);

  useEffect(() => {
    loadPack().catch(err =>
      setError(err instanceof Error ? err.message : "Unable to load sample organisation.")
    );
  }, [loadPack]);

  useEffect(() => {
    const active =
      installation?.status === "installing" ||
      installation?.status === "resetting" ||
      installation?.status === "removing";

    if (!active || !installation) {
      stopPolling();
      return;
    }

    stopPolling();
    pollRef.current = setInterval(() => {
      apiJson<{ installation: SampleInstallationView }>(
        `/api/sample-organisations/installations/${installation.id}`
      )
        .then(payload => {
          setInstallation(payload.installation);
          if (payload.installation.status === "ready") {
            setJustCompleted(true);
            stopPolling();
            loadPack().catch(() => undefined);
          }
          if (
            payload.installation.status === "failed" ||
            payload.installation.status === "removed" ||
            payload.installation.status === "intelligence_pending"
          ) {
            stopPolling();
          }
        })
        .catch(() => undefined);
    }, 1500);

    return stopPolling;
  }, [installation, loadPack, stopPolling]);

  async function runInstall() {
    if (busy) return;
    setBusy(true);
    setError("");
    setConfirmMode(null);
    setJustCompleted(false);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    try {
      const payload = await apiJson<{
        installation: SampleInstallationView;
        resumed?: boolean;
      }>("/api/sample-organisations/northbridge-healthcare/install", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({}),
      });
      setInstallation(payload.installation);
      if (
        payload.installation.status === "ready" ||
        payload.installation.status === "intelligence_pending"
      ) {
        if (payload.installation.status === "ready") {
          setJustCompleted(true);
        }
        idempotencyKeyRef.current = null;
      }
      await loadPack();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Sample organisation installation failed.";
      setError(message);
      await loadPack().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function runReset() {
    if (busy || !installation) return;
    setBusy(true);
    setError("");
    setConfirmMode(null);
    try {
      const payload = await apiJson<{ installation: SampleInstallationView }>(
        `/api/sample-organisations/installations/${installation.id}/reset`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setInstallation(payload.installation);
      setJustCompleted(true);
      await loadPack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runRemove() {
    if (busy || !installation || removeText.trim() !== "REMOVE") return;
    setBusy(true);
    setError("");
    setConfirmMode(null);
    try {
      await apiJson(`/api/sample-organisations/installations/${installation.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "REMOVE" }),
      });
      setInstallation(null);
      setJustCompleted(false);
      setRemoveText("");
      idempotencyKeyRef.current = null;
      await loadPack();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Removal failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openSample() {
    if (!installation || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(
        `/api/sample-organisations/installations/${installation.id}/open`,
        { method: "POST", body: JSON.stringify({}) }
      );
      window.location.assign("/?view=dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open sample organisation.");
      setBusy(false);
    }
  }

  async function retryIntelligence() {
    if (!installation || busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = await apiJson<{ installation: SampleInstallationView }>(
        `/api/sample-organisations/installations/${installation.id}/retry-intelligence`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setInstallation(payload.installation);
      if (payload.installation.status === "ready") setJustCompleted(true);
      await loadPack();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Organisation Intelligence could not be generated."
      );
    } finally {
      setBusy(false);
    }
  }

  const ready = installation?.status === "ready";
  const installing =
    installation?.status === "installing" ||
    installation?.status === "resetting";
  const intelligencePending = installation?.status === "intelligence_pending";
  const showAvailable = !installation || installation.status === "removed" || installation.status === "failed";

  return (
    <OrganisationShell
      eyebrow="SAMPLE ORGANISATION"
      title="Northbridge Healthcare Trust"
      subtitle="Create a realistic fictional coaching environment for demonstrations, training and evaluation."
      compactHeader
    >
      <div className="sample-organisation">
        {error ? (
          <p className="organisation-error" role="alert">
            {error}
          </p>
        ) : null}

        {pack && showAvailable && !installing ? (
          <section className="sample-organisation__panel" aria-labelledby="sample-available-title">
            <h2 id="sample-available-title" className="organisation-section-title">
              Available pack
            </h2>
            <p className="organisation-muted sample-organisation__lead">
              {pack.summary}
            </p>
            <ul className="sample-organisation__features">
              {pack.features.map(feature => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="sample-organisation__meta">
              Estimated setup time
              <strong>{SAMPLE_ORGANISATION_SETUP_ESTIMATE}</strong>
            </p>
            <div className="sample-organisation__actions">
              <IdentityButton
                variant="primary"
                disabled={busy}
                onClick={() => setConfirmMode("install")}
              >
                Install sample organisation
              </IdentityButton>
            </div>
            <p className="organisation-field-hint">{pack.privacyNote}</p>
          </section>
        ) : null}

        {installing && installation ? (
          <section className="sample-organisation__panel" aria-live="polite">
            <h2 className="organisation-section-title">Installing</h2>
            <p className="organisation-muted">{installation.stageLabel}</p>
            <p className="sample-organisation__meta">
              Estimated setup time
              <strong>{SAMPLE_ORGANISATION_SETUP_ESTIMATE}</strong>
            </p>
            <div
              className="sample-organisation__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={installation.progressPercent}
              aria-label="Installation progress"
            >
              <span
                className="sample-organisation__progress-bar"
                style={{ width: `${installation.progressPercent}%` }}
              />
            </div>
            <ol className="sample-organisation__stages">
              {SAMPLE_PROGRESS_STAGES.map(stage => {
                const currentIndex = SAMPLE_PROGRESS_STAGES.indexOf(
                  installation.stage as (typeof SAMPLE_PROGRESS_STAGES)[number]
                );
                const stageIndex = SAMPLE_PROGRESS_STAGES.indexOf(stage);
                const done = stageIndex >= 0 && stageIndex < currentIndex;
                const current = stage === installation.stage;
                return (
                  <li
                    key={stage}
                    className={
                      current
                        ? "is-current"
                        : done
                          ? "is-done"
                          : undefined
                    }
                  >
                    {SAMPLE_STAGE_LABELS[stage]}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {justCompleted && ready && installation ? (
          <section className="sample-organisation__panel">
            <h2 className="organisation-section-title">Sample organisation ready</h2>
            <p className="sample-organisation__lead">Northbridge Healthcare Trust</p>
            <ul className="sample-organisation__counts">
              <li>{installation.counts.relationships} relationships</li>
              <li>{installation.counts.sessions} conversations</li>
              <li>{installation.counts.actions} actions</li>
              <li>{installation.counts.developmentUpdates} development updates</li>
              <li>{installation.counts.intelligenceItems} intelligence items</li>
            </ul>
            <div className="sample-organisation__actions">
              <IdentityButton variant="primary" disabled={busy} onClick={openSample}>
                Open sample organisation
              </IdentityButton>
            </div>
          </section>
        ) : null}

        {ready && installation && !justCompleted ? (
          <section className="sample-organisation__panel">
            <h2 className="organisation-section-title">Installed</h2>
            <dl className="sample-organisation__status">
              <div>
                <dt>Status</dt>
                <dd>Sample organisation ready</dd>
              </div>
              <div>
                <dt>Installed on</dt>
                <dd>{formatInstalledAt(installation.installedAt)}</dd>
              </div>
              <div>
                <dt>Installed by</dt>
                <dd>{installation.installedByName ?? "You"}</dd>
              </div>
              <div>
                <dt>Pack version</dt>
                <dd>{installation.packVersion}</dd>
              </div>
            </dl>
            <ul className="sample-organisation__counts">
              <li>{installation.counts.relationships} relationships</li>
              <li>{installation.counts.sessions} conversations</li>
              <li>{installation.counts.actions} actions</li>
              <li>{installation.counts.developmentUpdates} development updates</li>
              <li>{installation.counts.intelligenceItems} intelligence items</li>
            </ul>
            <div className="sample-organisation__actions">
              <IdentityButton variant="primary" disabled={busy} onClick={openSample}>
                Open sample organisation
              </IdentityButton>
              <IdentityButton
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmMode("reset")}
              >
                Reset sample organisation
              </IdentityButton>
              <IdentityButton
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setRemoveText("");
                  setConfirmMode("remove");
                }}
              >
                Remove sample organisation
              </IdentityButton>
            </div>
          </section>
        ) : null}

        {intelligencePending && installation ? (
          <section className="sample-organisation__panel">
            <h2 className="organisation-section-title">Sample organisation ready</h2>
            <dl className="sample-organisation__status">
              <div>
                <dt>Status</dt>
                <dd>Sample organisation ready</dd>
              </div>
              <div>
                <dt>Organisation Intelligence</dt>
                <dd>Not yet available</dd>
              </div>
              <div>
                <dt>Installed on</dt>
                <dd>{formatInstalledAt(installation.installedAt)}</dd>
              </div>
              <div>
                <dt>Installed by</dt>
                <dd>{installation.installedByName ?? "You"}</dd>
              </div>
            </dl>
            <p className="organisation-muted sample-organisation__lead">
              Organisation Intelligence will become available when the organisation
              intelligence module is released.
            </p>
            <ul className="sample-organisation__counts">
              <li>{installation.counts.relationships} relationships</li>
              <li>{installation.counts.sessions} conversations</li>
              <li>{installation.counts.actions} actions</li>
              <li>{installation.counts.developmentUpdates} development updates</li>
              <li>{installation.counts.intelligenceItems} intelligence items</li>
            </ul>
            <div className="sample-organisation__actions">
              <IdentityButton variant="primary" disabled={busy} onClick={openSample}>
                Open sample organisation
              </IdentityButton>
              <IdentityButton
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmMode("reset")}
              >
                Reset sample organisation
              </IdentityButton>
              <IdentityButton
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setRemoveText("");
                  setConfirmMode("remove");
                }}
              >
                Remove sample organisation
              </IdentityButton>
              {installation.canRetryIntelligence ? (
                <IdentityButton
                  variant="secondary"
                  disabled={busy}
                  onClick={retryIntelligence}
                >
                  Retry intelligence generation
                </IdentityButton>
              ) : null}
            </div>
          </section>
        ) : null}

        {confirmMode ? (
          <div
            className="sample-organisation__dialog-backdrop"
            role="presentation"
            onClick={() => (!busy ? setConfirmMode(null) : undefined)}
          >
            <div
              className="sample-organisation__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId}
              onClick={event => event.stopPropagation()}
            >
              {confirmMode === "install" ? (
                <>
                  <h2 id={dialogTitleId} className="organisation-section-title">
                    Install sample organisation?
                  </h2>
                  <p>
                    This will create a complete fictional organisation with coaching
                    relationships, conversations and development evidence. Existing
                    organisation data will not be changed.
                  </p>
                  <p className="organisation-field-hint">
                    All names and coaching records in this sample are fictional.
                  </p>
                  <p className="sample-organisation__meta">
                    Estimated setup time
                    <strong>{SAMPLE_ORGANISATION_SETUP_ESTIMATE}</strong>
                  </p>
                  <div className="sample-organisation__actions">
                    <IdentityButton
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirmMode(null)}
                    >
                      Cancel
                    </IdentityButton>
                    <IdentityButton variant="primary" disabled={busy} onClick={runInstall}>
                      Install
                    </IdentityButton>
                  </div>
                </>
              ) : null}

              {confirmMode === "reset" ? (
                <>
                  <h2 id={dialogTitleId} className="organisation-section-title">
                    Reset sample organisation?
                  </h2>
                  <p>
                    Any changes made within the sample organisation will be removed and
                    the original fictional data will be restored. Other organisations
                    will not be affected.
                  </p>
                  <div className="sample-organisation__actions">
                    <IdentityButton
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirmMode(null)}
                    >
                      Cancel
                    </IdentityButton>
                    <IdentityButton variant="primary" disabled={busy} onClick={runReset}>
                      Reset
                    </IdentityButton>
                  </div>
                </>
              ) : null}

              {confirmMode === "remove" ? (
                <>
                  <h2 id={dialogTitleId} className="organisation-section-title">
                    Remove sample organisation?
                  </h2>
                  <p>
                    This will permanently remove Northbridge Healthcare Trust and all
                    fictional coaching records created by the installer. Other
                    organisation data will not be affected.
                  </p>
                  <label className="organisation-field" htmlFor={removeInputId}>
                    Type REMOVE to confirm
                    <input
                      id={removeInputId}
                      value={removeText}
                      onChange={event => setRemoveText(event.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </label>
                  <div className="sample-organisation__actions">
                    <IdentityButton
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirmMode(null)}
                    >
                      Cancel
                    </IdentityButton>
                    <IdentityButton
                      variant="danger"
                      disabled={busy || removeText.trim() !== "REMOVE"}
                      onClick={runRemove}
                    >
                      Remove
                    </IdentityButton>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </OrganisationShell>
  );
}
