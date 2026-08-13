import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  MANAGER_AURELIA_PROPOSE_CAPTURE_MAX_OUTPUT_TOKENS,
  buildManagerAureliaProposeCaptureInput,
  buildManagerAureliaProposeCaptureInstructions,
  isManagerAureliaCaptureType,
  parseManagerAureliaProposeCaptureDraft,
  validateManagerAureliaCaptureTurns,
} from "@/lib/ai/manager-aurelia-propose-capture";
import {
  rejectClientSuppliedDevelopmentContext,
  rejectPersonIdentifiers,
} from "@/lib/ai/manager-aurelia-conversation";
import { checkManagerAureliaRateLimit } from "@/lib/my-development/aurelia-rate-limit";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";

export const runtime = "nodejs";

/**
 * Stage 2.2.4 — propose editable Reflection/Action draft from in-memory turns.
 * Never writes to the database. Never persists transcript.
 */
export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  if (auth.context.organisation.professionalRole !== "manager") {
    return NextResponse.json(
      { error: "Manager Aurelia capture is only available to Managers." },
      { status: 403 }
    );
  }

  if (!auth.context.organisation.organisation.aiEnabled) {
    return NextResponse.json(
      { error: "AI is disabled for this organisation." },
      { status: 403 }
    );
  }

  const rate = checkManagerAureliaRateLimit({
    userId: auth.context.user.id,
    organisationId: auth.context.organisation.organisationId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const personCheck = rejectPersonIdentifiers(body);
  if (!personCheck.ok) {
    return NextResponse.json(
      { error: personCheck.error },
      { status: personCheck.status }
    );
  }

  const portfolioCheck = rejectClientSuppliedDevelopmentContext(body);
  if (!portfolioCheck.ok) {
    return NextResponse.json(
      { error: portfolioCheck.error },
      { status: portfolioCheck.status }
    );
  }

  if (!isManagerAureliaCaptureType(body.captureType)) {
    return NextResponse.json(
      { error: 'captureType must be "reflection" or "action".' },
      { status: 400 }
    );
  }

  const turnsResult = validateManagerAureliaCaptureTurns(body.turns ?? []);
  if (!turnsResult.ok) {
    return NextResponse.json(
      { error: turnsResult.error },
      { status: turnsResult.status }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Aurelia couldn't prepare a draft just now. Nothing has been saved. Please try again.",
      },
      { status: 500 }
    );
  }

  const openai = new OpenAI({ apiKey });
  const captureType = body.captureType;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: buildManagerAureliaProposeCaptureInstructions(captureType),
      input: buildManagerAureliaProposeCaptureInput(turnsResult.turns, captureType),
      max_output_tokens: MANAGER_AURELIA_PROPOSE_CAPTURE_MAX_OUTPUT_TOKENS,
    });

    const parsed = parseManagerAureliaProposeCaptureDraft(
      response.output_text ?? "",
      captureType
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 502 });
    }

    return NextResponse.json({
      captureType,
      draft: parsed.draft,
    });
  } catch {
    console.error("[manager-aurelia-propose-capture]", {
      errorCode: "MANAGER_AURELIA_PROPOSE_CAPTURE_FAILED",
    });
    return NextResponse.json(
      { error: "Unable to propose a draft right now. Please try again." },
      { status: 500 }
    );
  }
}
