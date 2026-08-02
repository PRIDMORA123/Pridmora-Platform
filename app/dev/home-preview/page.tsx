"use client";

import { IdentityHomePage } from "@/components/today-view";
import { AppShell } from "@/components/app-shell";
import { pilotFixtures } from "@/lib/pilot-fixtures";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { Client } from "@/lib/types";
import { Suspense } from "react";

type Scenario = "full" | "empty" | "one-prep" | "in-progress";

function HomePreviewInner() {
  const searchParams = useSearchParams();
  const scenario = (searchParams.get("scenario") as Scenario) || "full";

  const clients = useMemo((): Client[] => {
    switch (scenario) {
      case "empty":
        return [];
      case "one-prep":
        return [pilotFixtures[0]];
      case "in-progress":
        return [pilotFixtures[2]];
      default:
        return pilotFixtures;
    }
  }, [scenario]);

  if (process.env.NODE_ENV === "production") {
    return <main style={{ padding: 40 }}>Preview unavailable.</main>;
  }

  return (
    <AppShell
      view="dashboard"
      onNavigate={() => undefined}
      onNewClient={() => undefined}
      onSignOut={() => undefined}
      mobileOpen={false}
      setMobileOpen={() => undefined}
      coachName="Barry Pridmore"
      coachTitle="Executive Coach"
      coachInitials="BP"
    >
      <IdentityHomePage
        clients={clients}
        coachName="Barry"
        onOpenClient={() => undefined}
        onPrepare={() => undefined}
        onCreatePerson={() => undefined}
        onViewPeople={() => undefined}
      />
    </AppShell>
  );
}

export default function HomePreviewPage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Loading preview…</main>}>
      <HomePreviewInner />
    </Suspense>
  );
}
