/**
 * Canonical person-level OpenAI boundary.
 * All person-scoped generative routes must call these helpers instead of
 * openai.responses.create / chat.completions.create directly.
 */

import type OpenAI from "openai";
import {
  appendPersonLevelPrivacyAddendum,
  cleanDerivedAiText,
  createExternalAiNameMapping,
  minimiseForExternalAi,
  type ExternalAiKnownIdentities,
  type ExternalAiNameMapping,
} from "@/lib/ai/minimise-for-external";

export type PersonLevelResponseResult = {
  id: string | undefined;
  output_text: string;
  mapping: ExternalAiNameMapping;
};

export type PersonLevelChatResult = {
  id: string | undefined;
  model: string | undefined;
  content: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  mapping: ExternalAiNameMapping;
};

function minimiseInstructions(
  instructions: string | undefined,
  identities: ExternalAiKnownIdentities,
  mapping: ExternalAiNameMapping
): string {
  const minimised = minimiseForExternalAi(instructions ?? "", identities, mapping).text;
  return appendPersonLevelPrivacyAddendum(minimised);
}

export async function createPersonLevelResponse(
  openai: OpenAI,
  params: {
    model: string;
    instructions?: string;
    input: string;
    max_output_tokens?: number;
  },
  identities: ExternalAiKnownIdentities = {}
): Promise<PersonLevelResponseResult> {
  const mapping = createExternalAiNameMapping();
  const instructions = minimiseInstructions(params.instructions, identities, mapping);
  const input = minimiseForExternalAi(params.input, identities, mapping).text;

  const response = await openai.responses.create({
    model: params.model,
    instructions,
    input,
    ...(typeof params.max_output_tokens === "number"
      ? { max_output_tokens: params.max_output_tokens }
      : {}),
    store: false,
  });

  return {
    id: response.id,
    output_text: cleanDerivedAiText(response.output_text ?? "", mapping),
    mapping,
  };
}

export async function createPersonLevelChatCompletion(
  openai: OpenAI,
  params: {
    model: string;
    temperature?: number;
    max_tokens?: number;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    response_format?: { type: "json_object" };
  },
  identities: ExternalAiKnownIdentities = {},
  requestOptions?: { signal?: AbortSignal }
): Promise<PersonLevelChatResult> {
  const mapping = createExternalAiNameMapping();
  const messages = params.messages.map((message, index) => {
    const minimised = minimiseForExternalAi(message.content, identities, mapping).text;
    if (message.role === "system" && index === 0) {
      return { ...message, content: appendPersonLevelPrivacyAddendum(minimised) };
    }
    return { ...message, content: minimised };
  });

  const completion = await openai.chat.completions.create(
    {
      model: params.model,
      ...(typeof params.temperature === "number"
        ? { temperature: params.temperature }
        : {}),
      ...(typeof params.max_tokens === "number" ? { max_tokens: params.max_tokens } : {}),
      messages,
      ...(params.response_format ? { response_format: params.response_format } : {}),
      store: false,
    },
    requestOptions
  );

  const raw = completion.choices[0]?.message?.content ?? "";
  return {
    id: completion.id,
    model: completion.model,
    content: cleanDerivedAiText(raw, mapping),
    finishReason: completion.choices[0]?.finish_reason ?? null,
    promptTokens: completion.usage?.prompt_tokens ?? null,
    completionTokens: completion.usage?.completion_tokens ?? null,
    mapping,
  };
}
