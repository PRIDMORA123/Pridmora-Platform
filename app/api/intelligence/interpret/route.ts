import { NextResponse } from "next/server";

/**
 * Legacy endpoint. Individual pending insight generation is retired.
 * Session completion now creates one Development Update via
 * POST /api/development-updates/generate.
 */
export async function POST(request: Request) {
  let body: { clientId?: string; sessionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return NextResponse.json(
    {
      error:
        "Individual insight proposals have been replaced by a single Development Update per session.",
      code: "DEVELOPMENT_UPDATE_REQUIRED",
      redirect: "/api/development-updates/generate",
      clientId: body.clientId ?? null,
      sessionId: body.sessionId ?? null,
      recoverable: true,
    },
    { status: 410 }
  );
}
