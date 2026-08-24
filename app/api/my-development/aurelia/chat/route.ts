import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  MANAGER_AURELIA_MAX_OUTPUT_TOKENS,
  boundManagerAureliaReply,
  boundManagerAureliaTurns,
  buildManagerAureliaInput,
  buildManagerAureliaInstructions,
  rejectClientSuppliedDevelopmentContext,
  rejectPersonIdentifiers,
  validateManagerAureliaMessage,
} from "@/lib/ai/manager-aurelia-conversation";
import { loadManagerAureliaDevelopmentContext } from "@/lib/my-development/aurelia-context";
import { checkManagerAureliaRateLimit } from "@/lib/my-development/aurelia-rate-limit";
import { createPersonLevelResponse } from "@/lib/ai/person-level-openai";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";

export const runtime = "nodejs";

/**
 * Stage 2.2.3 — person-free Manager Aurelia multi-turn chat with optional
 * minimised self-development focus/actions context (server-resolved, read-only).
 * No transcript persistence. No person IDs.
 */
export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const professionalRole = auth.context.organisation.professionalRole;
  if (professionalRole !== "manager") {
    return NextResponse.json(
      { error: "Manager Aurelia is only available to Managers." },
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

  const messageResult = validateManagerAureliaMessage(body.message);
  if (!messageResult.ok) {
    return NextResponse.json(
      { error: messageResult.error },
      { status: messageResult.status }
    );
  }

  const turnsResult = boundManagerAureliaTurns(body.turns ?? []);
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
          "Aurelia couldn't respond just now. Your conversation hasn't been saved. Please try again.",
      },
      { status: 500 }
    );
  }

  // Read-only. Empty if no self-development record. Never creates one.
  const developmentContext = await loadManagerAureliaDevelopmentContext({
    supabase: auth.context.supabase,
    organisationId: auth.context.organisation.organisationId,
    userId: auth.context.user.id,
  });

  const openai = new OpenAI({ apiKey });
  const input = buildManagerAureliaInput(
    turnsResult.turns,
    messageResult.message,
    developmentContext
  );

  try {
    const response = await createPersonLevelResponse(openai, {
      model: "gpt-5.5",
      instructions: buildManagerAureliaInstructions(),
      input,
      max_output_tokens: MANAGER_AURELIA_MAX_OUTPUT_TOKENS,
    });

    const reply = boundManagerAureliaReply(response.output_text ?? "");
    if (!reply) {
      return NextResponse.json(
        {
          error:
            "Aurelia couldn't respond just now. Your conversation hasn't been saved. Please try again.",
        },
        { status: 502 }
      );
    }

    // Reply only — development context is never returned to the browser.
    return NextResponse.json({ reply });
  } catch {
    // Do not log request bodies, prompts, turns, context or replies.
    console.error("[manager-aurelia-chat]", {
      errorCode: "MANAGER_AURELIA_AI_FAILED",
    });
    return NextResponse.json(
      {
        error:
          "Aurelia couldn't respond just now. Your conversation hasn't been saved. Please try again.",
      },
      { status: 500 }
    );
  }
}
