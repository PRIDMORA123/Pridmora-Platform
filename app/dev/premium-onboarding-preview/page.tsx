"use client";

import { useMemo, useState } from "react";
import { FirstUserOnboarding } from "@/components/onboarding/first-user-onboarding";
import { PremiumEmptyHome } from "@/components/onboarding/premium-empty-home";
import { IdentityHomePage } from "@/components/today-view";
import { PremiumButton } from "@/components/premium";
import { pilotClientA } from "@/lib/pilot-fixtures";
import type { FirstUserOnboardingStep } from "@/lib/first-user-onboarding";

type PreviewMode =
  | "welcome"
  | "relationship"
  | "conversation"
  | "complete"
  | "empty"
  | "populated";

/**
 * Visual QA preview for premium first-user onboarding.
 * Not linked from production navigation.
 */
export default function PremiumOnboardingPreviewPage() {
  const [mode, setMode] = useState<PreviewMode>("welcome");
  const [mobile, setMobile] = useState(false);

  const initialStep = useMemo<FirstUserOnboardingStep>(() => {
    if (mode === "relationship") return "relationship";
    if (mode === "conversation") return "conversation";
    if (mode === "complete") return "complete";
    return "welcome";
  }, [mode]);

  return (
    <main
      className="premium-onboarding-preview"
      style={{
        minHeight: "100vh",
        background: "var(--identity-canvas)",
        padding: mobile ? "16px" : "32px 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
          maxWidth: 960,
        }}
      >
        {(
          [
            "welcome",
            "relationship",
            "conversation",
            "complete",
            "empty",
            "populated",
          ] as PreviewMode[]
        ).map(item => (
          <PremiumButton
            key={item}
            variant={mode === item ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode(item)}
          >
            {item}
          </PremiumButton>
        ))}
        <PremiumButton
          variant={mobile ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMobile(current => !current)}
        >
          {mobile ? "Switch to desktop" : "Switch to mobile"}
        </PremiumButton>
      </div>

      <div
        data-preview-frame={mode}
        style={{
          width: mobile ? 390 : "100%",
          maxWidth: mobile ? 390 : 960,
          margin: "0 auto",
          background: "var(--identity-canvas)",
          border: "1px solid var(--identity-border-soft)",
          borderRadius: 16,
          padding: mobile ? "8px 16px 32px" : "8px 32px 48px",
        }}
      >
        {mode === "empty" ? (
          <PremiumEmptyHome onCreateRelationship={() => setMode("relationship")} />
        ) : null}

        {mode === "populated" ? (
          <IdentityHomePage
            clients={[pilotClientA]}
            coachName="Barry"
            userId="preview-populated"
            coachId="preview-populated"
            onOpenClient={() => undefined}
            onPrepare={() => undefined}
          />
        ) : null}

        {mode !== "empty" && mode !== "populated" ? (
          <FirstUserOnboarding
            key={`${mode}-${mobile ? "m" : "d"}`}
            userId={`preview-${mode}`}
            coachId="preview-coach"
            initialStep={initialStep}
            onDismiss={() => setMode("empty")}
            onCreateClient={async fields => ({
              id: "preview-client",
              name: fields.name || "Preview Person",
            })}
            onCreateSession={async () => ({ id: "preview-session" })}
            onPrepare={() => undefined}
            onViewRelationship={() => undefined}
          />
        ) : null}
      </div>
    </main>
  );
}
