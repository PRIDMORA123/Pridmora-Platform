/**
 * Development prompt functions.
 *
 * Canonical entry for living-profile updates and development-report drafting.
 * Re-exports the Identity development prompts used by API routes.
 */

export {
  DEVELOPMENT_UPDATE_SYSTEM_PROMPT,
  buildDevelopmentUpdateInput,
  formatProfileForPrompt,
} from "@/lib/ai/development-update-prompt";

export { DEVELOPMENT_REPORT_TASK_PROMPT } from "@/lib/ai/development-report-prompt";
