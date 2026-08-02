"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";

export default function AcceptInvitationPage() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This invitation link is missing a token.");
      return;
    }

    let active = true;
    setStatus("working");
    apiJson<{ organisationId: string; organisationName?: string }>(
      "/api/organisations/invitations",
      {
        method: "POST",
        body: JSON.stringify({ action: "accept", token }),
      }
    )
      .then(result => {
        if (!active) return;
        setStatus("done");
        const orgLabel = result.organisationName?.trim() || "your organisation";
        setMessage(
          `You have joined ${orgLabel} on the ${BRAND.productName}. Opening your organisation workspace…`
        );
        window.location.assign("/?view=dashboard");
        void result;
      })
      .catch(err => {
        if (!active) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Unable to accept invitation.");
      });

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
      {status === "working" ? <p>Accepting invitation…</p> : null}
      {status === "done" ? <p>{message}</p> : null}
      {status === "error" ? <p className="organisation-error">{message}</p> : null}
    </main>
  );
}
