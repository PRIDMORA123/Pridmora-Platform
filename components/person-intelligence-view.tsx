"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import { DevelopmentProfilePage } from "@/components/development/development-profile-page";
import { SupportingContextSection } from "@/components/development/supporting-context-section";
import { DevelopmentIntelligenceEvidencePanel } from "@/components/development-evidence/development-intelligence-evidence-panel";
import { ProposedContentLabel, IdentityBackLink } from "@/components/identity";
import {
  AURELIA_WORKING_DETAIL,
  AURELIA_WORKING_TITLE,
  IdentityProcessingState,
} from "@/components/identity/identity-processing-state";
import { PatternsOverTimeSection } from "@/components/patterns/pattern-panels";
import { JourneyStagePage } from "@/components/coaching-journey/journey-stage-page";
import { RelationshipIdentityBar } from "@/components/coaching-journey/relationship-identity-bar";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { RelationshipIsolationFailsafe } from "@/components/relationship-isolation-failsafe";
import { apiJson, errorMessage } from "@/lib/api-client";
import { buildDevelopmentProfileViewModel } from "@/lib/development-profile-view-model";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import { STAGE_ORIENTATION_COPY } from "@/lib/coaching-journey";
import type { Client } from "@/lib/types";
import type { SupportingContextItem } from "@/lib/relationship-meta";
import { updateClientRecord } from "@/lib/storage";
import type { CoachingPattern } from "@/lib/patterns/types";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";

export function PersonIntelligenceView({
  client,
  onBack,
  onTabChange,
  onReviewUpdate,
  onClientUpdated,
  onOpenEvidence,
}: {
  client: Client;
  onBack: () => void;
  onTabChange?: (tab: ClientWorkspaceTab) => void;
  onReviewUpdate?: (updateId: string) => void;
  onClientUpdated?: (client: Client) => void;
  onOpenEvidence?: () => void;
}) {
  void onTabChange;
  const [profile, setProfile] = useState<DevelopmentProfile | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<DevelopmentUpdate | null>(null);
  const [appliedUpdates, setAppliedUpdates] = useState<DevelopmentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contextItems, setContextItems] = useState<SupportingContextItem[]>(
    client.supportingContext ?? []
  );
  const [patterns, setPatterns] = useState<CoachingPattern[]>([]);
  const [reviewingPattern, setReviewingPattern] =
    useState<CoachingPattern | null>(null);
  const [refreshingPatterns, setRefreshingPatterns] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [layer, setLayer] = useState<"development" | "intelligence">(
    "development"
  );

  useEffect(() => {
    setContextItems(client.supportingContext ?? []);
  }, [client.id, client.supportingContext]);

  const load = useCallback(async () => {
    setProfile(null);
    setPendingUpdate(null);
    setAppliedUpdates([]);
    setPatterns([]);
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{
        profile: DevelopmentProfile;
        pendingUpdate: DevelopmentUpdate | null;
        updates?: DevelopmentUpdate[];
      }>(`/api/development-profiles/${client.id}`);
      if (data.profile && data.profile.clientId !== client.id) {
        throw new Error("Relationship-scoped data integrity check failed.");
      }
      if (data.pendingUpdate && data.pendingUpdate.clientId !== client.id) {
        throw new Error("Relationship-scoped data integrity check failed.");
      }
      setProfile(data.profile);
      setPatterns(data.profile.coachingPatterns ?? []);
      setPendingUpdate(data.pendingUpdate);
      setAppliedUpdates(
        (data.updates ?? []).filter(
          update =>
            update.status === "applied" && update.clientId === client.id
        )
      );
    } catch (err) {
      setProfile(null);
      setPendingUpdate(null);
      setAppliedUpdates([]);
      setPatterns([]);
      const message = errorMessage(err, "Unable to load development intelligence.");
      if (/Relationship-scoped data integrity/i.test(message)) {
        console.error(
          "[relationship-isolation] Development integrity check failed",
          { relationshipId: client.id, error: err }
        );
        setError("__isolation__");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    setLayer("development");
    void load();
  }, [load]);

  const viewModel = useMemo(
    () => buildDevelopmentProfileViewModel(client, profile, appliedUpdates),
    [client, profile, appliedUpdates]
  );

  const developmentPatterns = useMemo(() => {
    return patterns.filter(
      pattern =>
        !pattern.suppressed &&
        pattern.coachAccepted !== false &&
        pattern.status !== "resolved" &&
        (pattern.strength === "emerging" || pattern.strength === "established")
    );
  }, [patterns]);

  const sessionNumbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of client.sessions) {
      map.set(session.id, session.sessionNumber);
    }
    return map;
  }, [client.sessions]);

  async function refreshPatterns(force = true) {
    setRefreshingPatterns(true);
    try {
      const data = await apiJson<{ patterns: CoachingPattern[] }>(
        "/api/patterns/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id, force }),
        }
      );
      setPatterns(data.patterns ?? []);
    } catch (err) {
      setError(errorMessage(err, "Unable to refresh pattern intelligence."));
    } finally {
      setRefreshingPatterns(false);
    }
  }

  async function saveSupportingContext(next: SupportingContextItem[]) {
    const updated = await updateClientRecord(client.id, {
      name: getRelationshipDisplayName(client),
      organisation: client.organisation,
      role: client.role,
      email: client.email,
      supportingContext: next,
    });
    setContextItems(updated.supportingContext ?? next);
    onClientUpdated?.(updated);
  }

  async function submitPatternReview(input: {
    action: "accept" | "reject" | "edit" | "no_longer_relevant";
    title?: string;
    description?: string;
    coachComment?: string;
  }) {
    if (!reviewingPattern) return;
    setReviewBusy(true);
    try {
      const data = await apiJson<{
        patterns: CoachingPattern[];
        pattern: CoachingPattern;
      }>("/api/patterns/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          patternId: reviewingPattern.id,
          ...input,
        }),
      });
      setPatterns(data.patterns ?? []);
      setReviewingPattern(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to save pattern review."));
    } finally {
      setReviewBusy(false);
    }
  }

  if (error === "__isolation__") {
    return <RelationshipIsolationFailsafe />;
  }

  const orientation = STAGE_ORIENTATION_COPY.development;

  if (loading) {
    return (
      <section className="page identity-reveal identity-page-shell journey-stage-page">
        <IdentityBackLink onClick={onBack}>{`Back to ${getRelationshipDisplayName(client)}`}</IdentityBackLink>
        <IdentityProcessingState
          title={AURELIA_WORKING_TITLE}
          description={AURELIA_WORKING_DETAIL}
        />
      </section>
    );
  }

  return (
    <JourneyStagePage
      back={
        <IdentityBackLink onClick={onBack}>{`Back to ${getRelationshipDisplayName(client)}`}</IdentityBackLink>
      }
      navigation={null}
      banners={
        error ? (
          <div
            className={/migration/i.test(error) ? "migration-banner" : "inline-error"}
            role="alert"
          >
            <p>{error}</p>
            {/migration/i.test(error) ? null : (
              <button type="button" className="text-link" onClick={() => void load()}>
                Retry
              </button>
            )}
          </div>
        ) : null
      }
      identity={
        <RelationshipIdentityBar
          clientName={getRelationshipDisplayName(client)}
          role={client.role}
          organisation={client.organisation}
        />
      }
      orientation={
        <StageOrientation
          title={orientation.title}
          description={orientation.description}
        />
      }
      nextStep={
        <JourneyNextStep
          now="Reviewing development over time"
          next={
            pendingUpdate
              ? "Review the pending development update"
              : "Return to Current Position when ready"
          }
        />
      }
      nextStepPosition="before"
    >
      <nav className="person-development-subnav" aria-label="Development sections">
        {layer === "development" ? (
          <span className="person-development-subnav__item is-active">
            Development
          </span>
        ) : (
          <button
            type="button"
            className="person-development-subnav__item"
            onClick={() => setLayer("development")}
          >
            Development
          </button>
        )}
        {layer === "intelligence" ? (
          <span className="person-development-subnav__item is-active">
            Intelligence
          </span>
        ) : (
          <button
            type="button"
            className="person-development-subnav__item"
            onClick={() => setLayer("intelligence")}
          >
            Intelligence
          </button>
        )}
        {onOpenEvidence ? (
          <button
            type="button"
            className="person-development-subnav__item"
            onClick={onOpenEvidence}
          >
            Evidence
          </button>
        ) : null}
      </nav>

      {layer === "intelligence" ? (
        <>
          <DevelopmentIntelligenceEvidencePanel
            clientId={client.id}
            profile={profile}
            onOpenEvidence={onOpenEvidence}
          />
          <PatternsOverTimeSection
            patterns={developmentPatterns}
            sessionNumbers={sessionNumbers}
            showAll
            onReview={setReviewingPattern}
            onRefresh={() => void refreshPatterns(true)}
            refreshing={refreshingPatterns}
            reviewingPattern={reviewingPattern}
            onCloseReview={() => setReviewingPattern(null)}
            onSubmitReview={submitPatternReview}
            reviewBusy={reviewBusy}
          />
        </>
      ) : (
        <DevelopmentProfilePage
          data={viewModel}
          patterns={developmentPatterns}
          sessionNumbers={sessionNumbers}
          includeRecognisedPatterns={false}
          onOpenIntelligence={() => setLayer("intelligence")}
          onReviewPattern={setReviewingPattern}
          onRefreshPatterns={() => void refreshPatterns(true)}
          refreshingPatterns={refreshingPatterns}
          reviewingPattern={reviewingPattern}
          onCloseReview={() => setReviewingPattern(null)}
          onSubmitReview={submitPatternReview}
          reviewBusy={reviewBusy}
          supportingContextSlot={
            <SupportingContextSection
              items={contextItems}
              onSave={saveSupportingContext}
            />
          }
          pendingUpdateSlot={
            pendingUpdate && onReviewUpdate ? (
              <section className="development-section">
                <h2>Development update available</h2>
                <ProposedContentLabel />
                <p className="identity-body">
                  Review the suggested changes from the latest conversation before they
                  become part of the confirmed development picture.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => onReviewUpdate(pendingUpdate.id)}
                  >
                    Review development update
                  </button>
                </div>
              </section>
            ) : null
          }
        />
      )}
    </JourneyStagePage>
  );
}
