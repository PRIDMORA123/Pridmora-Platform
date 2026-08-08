import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/owner/auth";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  isSupabaseConfigured,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

type ServiceStatus = "operational" | "degraded" | "unavailable" | "unknown";

function statusFromConfig(configured: boolean): ServiceStatus {
  return configured ? "unknown" : "unknown";
}

export async function GET() {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const supabaseConfigured = isSupabaseConfigured();
  const serviceRoleConfigured = isSupabaseServiceRoleConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
  );

  // Do not fabricate uptime, latency, or green status without monitoring.
  const services = [
    {
      id: "application",
      label: "Application",
      status: "unknown" as ServiceStatus,
      detail: "Monitoring not configured",
    },
    {
      id: "database",
      label: "Database / Supabase",
      status: statusFromConfig(supabaseConfigured),
      detail: supabaseConfigured
        ? "Monitoring not configured"
        : "Supabase environment variables are not configured",
    },
    {
      id: "authentication",
      label: "Authentication",
      status: statusFromConfig(supabaseConfigured),
      detail: "Monitoring not configured",
    },
    {
      id: "ai",
      label: "AI provider",
      status: openaiConfigured ? ("unknown" as ServiceStatus) : ("unknown" as ServiceStatus),
      detail: openaiConfigured
        ? "Monitoring not configured"
        : "AI provider key not configured in this environment",
    },
    {
      id: "email",
      label: "Email",
      status: "unknown" as ServiceStatus,
      detail: "Monitoring not configured",
    },
    {
      id: "storage",
      label: "Storage",
      status: statusFromConfig(supabaseConfigured),
      detail: "Monitoring not configured",
    },
    {
      id: "payments",
      label: "Payment provider",
      status: "unknown" as ServiceStatus,
      detail: stripeConfigured
        ? "Provider credentials detected; monitoring not configured"
        : "No payment provider integrated in this repository",
    },
  ];

  const payload = {
    services,
    metrics: {
      failedRequests: null,
      recentServerErrors: null,
      aiFailureCount: null,
      authenticationFailures: null,
      responseTimeMs: null,
    },
    notes: [
      "Monitoring not configured",
      serviceRoleConfigured
        ? "Service role is available for authorised server operations."
        : "Service role is not configured in this environment.",
    ],
  };

  assertOwnerPayloadIsSafe(payload);
  return NextResponse.json(payload);
}
