"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import {
  buildInvitationAcceptSignInHref,
  ensureInvitationAcceptSession,
  readInvitationTokenFromSearch,
} from "@/lib/organisations/invitation-accept-auth";
import { resolveInvitationAcceptLanding } from "@/lib/organisations/invitation-landing";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function AcceptInvitationPage() {
  const params = useSearchParams();
  const token = readInvitationTokenFromSearch(params);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This invitation link is missing a token.");
      return;
    }

    let active = true;
    setStatus("working");
    setMessage("Confirming your invitation…");

    async function accept() {
      try {
        const supabase = createBrowserSupabaseClient();
        const session = await ensureInvitationAcceptSession(supabase, {
          search: window.location.search,
          hash: window.location.hash,
        });

        if (!active) return;

        if (!session.ok) {
          window.location.assign(buildInvitationAcceptSignInHref(token));
          return;
        }

        const result = await apiJson<{
          organisationId: string;
          organisationName?: string;
          role: string;
          professionalRole: string | null;
        }>("/api/organisations/invitations", {
          method: "POST",
          body: JSON.stringify({ action: "accept", token }),
          // Session already verified above for this invitation journey.
          requireAuth: false,
        });

        if (!active) return;
        setStatus("done");
        const orgLabel = result.organisationName?.trim() || "your organisation";
        setMessage(
          `You have joined ${orgLabel} on the ${BRAND.productName}. Opening your workspace…`
        );
        const landing = resolveInvitationAcceptLanding({
          role: result.role,
          professionalRole: result.professionalRole,
        });
        window.location.assign(landing);
      } catch (err) {
        if (!active) return;
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "Unable to accept invitation."
        );
      }
    }

    void accept();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="organisation-invite-accept">
      <p className="eyebrow">{BRAND.productName}</p>
      <h1>Organisation invitation</h1>
      <p className="muted">
        You have been invited to join an organisation on the{" "}
        {BRAND.productName}.
      </p>
      {status === "working" ? <p>{message || "Accepting invitation…"}</p> : null}
      {status === "done" ? <p>{message}</p> : null}
      {status === "error" ? (
        <p className="organisation-error">{message}</p>
      ) : null}
    </main>
  );
}
