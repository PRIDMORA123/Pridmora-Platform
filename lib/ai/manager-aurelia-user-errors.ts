/**
 * Stage 3.2A — Manager-facing Aurelia error wording.
 * Never expose vendor/stack details. Preserve memory-only trust.
 */

const UNSAFE_ERROR_PATTERN =
  /openai|api key|gpt-|anthropic|stack|supabase|postgres|sql|exception|undefined|null reference|econn|fetch failed|status code|internal server/i;

export const MANAGER_AURELIA_CHAT_UNAVAILABLE =
  "Aurelia couldn't respond just now. Your conversation hasn't been saved. Please try again.";

export const MANAGER_AURELIA_CAPTURE_UNAVAILABLE =
  "Aurelia couldn't prepare a draft just now. Nothing has been saved. Please try again.";

export function toManagerAureliaUserError(
  value: unknown,
  fallback: string = MANAGER_AURELIA_CHAT_UNAVAILABLE
): string {
  let message = "";
  if (value instanceof Error) {
    message = value.message.trim();
  } else if (typeof value === "string") {
    message = value.trim();
  } else if (value && typeof value === "object" && "message" in value) {
    message = String((value as { message: unknown }).message ?? "").trim();
  }

  if (!message || UNSAFE_ERROR_PATTERN.test(message)) {
    return fallback;
  }

  // Known safe API messages may pass through when they already protect privacy.
  if (
    /hasn't been saved|has not been saved|nothing has been saved|not saved|try again/i.test(
      message
    ) &&
    !UNSAFE_ERROR_PATTERN.test(message)
  ) {
    return message;
  }

  return fallback;
}
