/**
 * FIX-5 — Sensitive-information recording / upload guardrail (data minimisation).
 * Concise product guidance only — not legal policy, DLP, or a classifier.
 * Sector-neutral UK English.
 */

/** Talk / Generic Aurelia — shown once at entry, not per message. */
export const SENSITIVE_INFO_AURELIA_ENTRY_COPY =
  "Focus on the situation and what you need to think through. Avoid unnecessary identifying or sensitive details about other people — a role, context or first name is usually enough.";

/**
 * Light prompt reminder for Manager Aurelia.
 * Must not become a repetitive disclaimer in every reply.
 */
export const SENSITIVE_INFO_AURELIA_PROMPT_GUIDANCE = `Data minimisation (quiet guidance — do not lecture every turn):
- Prefer helping the Manager focus on the management or development situation.
- If they paste large amounts of identifiable or sensitive third-party detail that is clearly unnecessary, you may briefly suggest focusing on the development purpose and omitting unnecessary identifying details — once, calmly, without refusing ordinary management support.
- Do not tell them never to mention people they manage. Do not invent organisational policy. Do not turn this into a compliance script.`;

/** Preparation private free-text — managers. */
export const SENSITIVE_INFO_PREPARATION_NOTES_HELPER =
  "Private and optional. Use this for how you want to approach the conversation — not for HR case notes, medical information, grievance or disciplinary records, safeguarding material or other formal source documents. Keep those in your organisation’s appropriate system.";

/** Development Evidence orientation — what this space is for. */
export const SENSITIVE_INFO_EVIDENCE_PURPOSE_COPY =
  "Development Evidence supports your development. It is not an employee case file, personnel record, clinical record, safeguarding record or incident-management system.";

/**
 * Development Evidence upload — highest-priority reminder.
 * Shown before the manager proceeds with a file.
 */
export const SENSITIVE_INFO_EVIDENCE_UPLOAD_COPY =
  "Before you continue, check that this document does not contain unnecessary identifying or sensitive information about other people. Prefer a developmental extract or summary where possible, and keep formal case records in your organisation’s appropriate system. You can redact unnecessary details yourself before uploading.";

/** Short reinforce on purpose/confirm step — not a second wall. */
export const SENSITIVE_INFO_EVIDENCE_PURPOSE_STEP_COPY =
  "This upload is development evidence for your record — not a place to store formal employee, medical, grievance, disciplinary or safeguarding case files.";
