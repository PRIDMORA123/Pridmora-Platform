"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { IdentityButton } from "@/components/identity/button";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { apiJson } from "@/lib/api-client";
import type {
  OrganisationGuidanceRecord,
  OrganisationGuidanceType,
} from "@/lib/organisation-guidance";

const GUIDANCE_TYPE_LABELS: Record<OrganisationGuidanceType, string> = {
  policy: "Policy",
  values: "Values",
  manager_guidance: "Manager Guidance",
};

function statusLabel(status: OrganisationGuidanceRecord["status"]): string {
  if (status === "approved") return "Approved for Aurelia";
  if (status === "withdrawn") return "Withdrawn";
  return "Draft";
}

export default function OrganisationGuidancePage() {
  const [guidance, setGuidance] = useState<OrganisationGuidanceRecord[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const [title, setTitle] = useState("");
  const [guidanceType, setGuidanceType] =
    useState<OrganisationGuidanceType>("policy");
  const [versionLabel, setVersionLabel] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await apiJson<{
        guidance: OrganisationGuidanceRecord[];
        canManage: boolean;
      }>("/api/organisations/guidance");

      setGuidance(payload.guidance ?? []);
      setCanManage(payload.canManage);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load organisation guidance."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setTitle("");
    setGuidanceType("policy");
    setVersionLabel("");
    setEffectiveFrom("");
    setReviewDate("");
    setFile(null);
  }

  async function updateGuidanceStatus(
    guidanceId: string,
    action: "approve" | "withdraw"
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await apiJson(`/api/organisations/guidance/${guidanceId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });

      setNotice(
        action === "approve"
          ? "Guidance approved for Aurelia."
          : "Guidance withdrawn. Aurelia will no longer use it."
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update organisation guidance."
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadGuidance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!file) {
      setError("Choose a PDF or DOCX document.");
      return;
    }

    setBusy(true);

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("guidanceType", guidanceType);
      form.set("title", title);
      if (versionLabel.trim()) form.set("versionLabel", versionLabel.trim());
      if (effectiveFrom) form.set("effectiveFrom", effectiveFrom);
      if (reviewDate) form.set("reviewDate", reviewDate);

      const response = await fetch("/api/organisations/guidance/upload", {
        method: "POST",
        body: form,
      });

      const payload = (await response.json()) as {
        error?: string;
        readable?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to upload guidance.");
      }

      if (payload.readable === false) {
        setNotice(
          payload.error ||
            "The document was saved as a draft but could not be read by Aurelia."
        );
      } else {
        setNotice(
          "Guidance uploaded as a draft. Review it before approving it for Aurelia."
        );
      }

      resetForm();
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to upload guidance."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganisationShell
      title="Organisation Guidance"
      subtitle="Give Aurelia approved organisational context to help managers apply your policies, values and expectations in everyday situations."
    >
      {error ? <p className="organisation-error">{error}</p> : null}
      {notice ? <p className="organisation-muted">{notice}</p> : null}

      {canManage ? (
        <div className="organisation-members-toolbar">
          <IdentityButton
            variant={showAdd ? "secondary" : "primary"}
            onClick={() => setShowAdd(value => !value)}
            disabled={busy}
          >
            {showAdd ? "Cancel" : "Add guidance"}
          </IdentityButton>
        </div>
      ) : null}

      {showAdd && canManage ? (
        <section className="organisation-panel">
          <h2 className="organisation-section-title">Add guidance</h2>
          <p className="organisation-muted">
            Add an approved organisational document. Uploading creates a draft.
            Aurelia will not use it until you explicitly approve it.
          </p>

          <form onSubmit={uploadGuidance}>
            <div className="organisation-field">
              <label htmlFor="guidance-title">Title</label>
              <input
                id="guidance-title"
                type="text"
                value={title}
                maxLength={200}
                required
                onChange={event => setTitle(event.target.value)}
                placeholder="Attendance Management Policy"
              />
            </div>

            <div className="organisation-field">
              <label htmlFor="guidance-type">Type</label>
              <select
                id="guidance-type"
                value={guidanceType}
                onChange={event =>
                  setGuidanceType(
                    event.target.value as OrganisationGuidanceType
                  )
                }
              >
                <option value="policy">Policy</option>
                <option value="values">Values</option>
                <option value="manager_guidance">Manager Guidance</option>
              </select>
            </div>

            <div className="organisation-field">
              <label htmlFor="guidance-version">Version</label>
              <input
                id="guidance-version"
                type="text"
                value={versionLabel}
                onChange={event => setVersionLabel(event.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="organisation-field">
              <label htmlFor="guidance-effective">Effective from</label>
              <input
                id="guidance-effective"
                type="date"
                value={effectiveFrom}
                onChange={event => setEffectiveFrom(event.target.value)}
              />
            </div>

            <div className="organisation-field">
              <label htmlFor="guidance-review">Review date</label>
              <input
                id="guidance-review"
                type="date"
                value={reviewDate}
                onChange={event => setReviewDate(event.target.value)}
              />
            </div>

            <div className="organisation-field">
              <label htmlFor="guidance-file">Document</label>
              <input
                id="guidance-file"
                type="file"
                required
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={event => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="organisation-muted">
                PDF or DOCX, up to 10 MB.
              </p>
            </div>

            <IdentityButton variant="primary" type="submit" disabled={busy}>
              {busy ? "Uploading…" : "Upload as draft"}
            </IdentityButton>
          </form>
        </section>
      ) : null}

      {!loading && guidance.length === 0 ? (
        <section className="organisation-empty-state">
          <p>No organisation guidance has been added yet.</p>
          <p className="organisation-muted">
            Add approved policies, values or manager guidance when you are ready
            to give Aurelia organisation-specific context.
          </p>
        </section>
      ) : null}

      {guidance.length > 0 ? (
        <section className="organisation-panel">
          <h2 className="organisation-section-title">Guidance library</h2>
          <ul className="organisation-attention-list">
            {guidance.map(item => (
              <li key={item.id} className="organisation-attention-item">
                <p className="organisation-attention-item__title">
                  {item.title}
                </p>
                <p className="organisation-attention-item__meta">
                  {GUIDANCE_TYPE_LABELS[item.guidanceType]} ·{" "}
                  {statusLabel(item.status)}
                  {item.versionLabel ? ` · Version ${item.versionLabel}` : ""}
                  {item.reviewDate
                    ? ` · Review ${new Date(
                        `${item.reviewDate}T00:00:00`
                      ).toLocaleDateString()}`
                    : ""}
                </p>
                <p className="organisation-muted">
                  {item.originalFileName}
                </p>

                {item.status === "draft" ? (
                  <IdentityButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void updateGuidanceStatus(item.id, "approve")
                    }
                  >
                    {busy ? "Updating…" : "Approve for Aurelia"}
                  </IdentityButton>
                ) : null}

                {item.status === "approved" ? (
                  <IdentityButton
                    variant="quiet"
                    disabled={busy}
                    onClick={() =>
                      void updateGuidanceStatus(item.id, "withdraw")
                    }
                  >
                    {busy ? "Updating…" : "Withdraw"}
                  </IdentityButton>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <p className="organisation-muted">Loading organisation guidance…</p>
      ) : null}
    </OrganisationShell>
  );
}
