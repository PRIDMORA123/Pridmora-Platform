import OpenAI from "openai";
import { NextResponse } from "next/server";
import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";
import { requireAuthenticatedUser } from "@/lib/auth/session";

type CoachingQuestionsRequest = {
  notes?: string;
};

const COACHING_QUESTIONS_TASK_PROMPT = `Generate five powerful coaching questions.

Requirements

Questions must:

• be open questions
• encourage reflection
• increase awareness
• avoid advice
• avoid solutions
• avoid assumptions
• avoid interpretation
• avoid judgement
• avoid yes/no questions
• relate directly to the supplied notes

If the notes contain insufficient information, generate clarification questions instead.

Return only:

Powerful Coaching Questions

1.
2.
3.
4.
5.

No introductions.
No explanations.`;

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 }
    );
  }

  let body: CoachingQuestionsRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { notes } = body;

  if (!notes?.trim()) {
    return NextResponse.json(
      { error: "Add session notes before generating coaching questions." },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });

  const input = `${COACHING_QUESTIONS_TASK_PROMPT}

Session notes:

${notes.trim()}`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: IDENTITY_SYSTEM_PROMPT,
      input,
    });

    const questions = response.output_text?.trim();
    if (!questions) {
      return NextResponse.json(
        { error: "No coaching questions were generated." },
        { status: 502 }
      );
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("OpenAI coaching questions error:", error);
    return NextResponse.json(
      { error: "Failed to generate coaching questions. Please try again." },
      { status: 500 }
    );
  }
}
