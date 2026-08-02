"use client";

import { useCallback, useEffect, useState } from "react";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { OrganisationInfoBanner } from "@/components/organisation/organisation-info-banner";
import { AssignmentForm } from "@/components/organisation/assignment-form";
import { AssignmentList } from "@/components/organisation/assignment-list";
import type { AssignmentListRow } from "@/components/organisation/assignment-list";
import { PractitionerSummary } from "@/components/organisation/practitioner-summary";
import type { PractitionerSummaryItem } from "@/components/organisation/practitioner-summary";
import { apiJson } from "@/lib/api-client";
import type { AssignmentRole } from "@/lib/organisations/types";

type Relationship = { id: string; name: string; status: string };

export default function OrganisationAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentListRow[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerSummaryItem[]>(
    []
  );
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [clientId, setClientId] = useState("");
  const [userId, setUserId] = useState("");
  const [assignmentRole, setAssignmentRole] =
    useState<AssignmentRole>("primary");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const payload = await apiJson<{
      assignments: AssignmentListRow[];
      practitioners: PractitionerSummaryItem[];
      relationships: Relationship[];
    }>("/api/organisations/assignments");
    setAssignments(payload.assignments);
    setPractitioners(payload.practitioners);
    setRelationships(payload.relationships);
    setClientId(current => current || payload.relationships[0]?.id || "");
    setUserId(current => current || payload.practitioners[0]?.userId || "");
  }, []);

  useEffect(() => {
    load()
      .catch(err =>
        setError(
          err instanceof Error ? err.message : "Unable to load assignments."
        )
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function assign() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await apiJson("/api/organisations/assignments", {
        method: "POST",
        body: JSON.stringify({
          action: assignmentRole === "primary" ? "transfer" : "assign",
          clientId,
          userId,
          assignmentRole,
        }),
      });
      await load();
      setSuccess("Assignment saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function end(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      await apiJson("/api/organisations/assignments", {
        method: "POST",
        body: JSON.stringify({ action: "end", assignmentId }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to end assignment.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganisationShell
      title="Assignments"
      subtitle="Assign practitioners to developmental relationships."
    >
      <OrganisationInfoBanner>
        Transferring a primary practitioner preserves relationship history.
        Previous practitioner-only private notes remain restricted to the
        original owner.
      </OrganisationInfoBanner>

      {loading ? (
        <p className="organisation-muted">Loading assignments…</p>
      ) : null}
      {error ? <p className="organisation-error">{error}</p> : null}

      <section className="organisation-panel">
        <h2 className="organisation-section-title">Practitioners</h2>
        <PractitionerSummary practitioners={practitioners} />
      </section>

      <AssignmentForm
        relationships={relationships}
        practitioners={practitioners}
        clientId={clientId}
        userId={userId}
        assignmentRole={assignmentRole}
        busy={busy}
        success={success}
        onClientIdChange={setClientId}
        onUserIdChange={setUserId}
        onAssignmentRoleChange={setAssignmentRole}
        onSubmit={() => void assign()}
      />

      <AssignmentList
        assignments={assignments}
        busy={busy}
        onEnd={end}
      />
    </OrganisationShell>
  );
}
