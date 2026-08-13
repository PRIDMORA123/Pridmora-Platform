# Customer #1 Pilot Setup Runbook

**Status:** Operational guidance for controlled pilot setup  
**Product:** Pridmora Development Platform  
**Related:** [`V1-PILOT-SCOPE.md`](./V1-PILOT-SCOPE.md), Owner Console

This runbook supports a **controlled** Customer #1 pilot. It does not put secrets, credentials, or customer personal data in the repository.

---

## 0. Frozen Supabase targets (product-owner decision)

| Role | Project name | Project ref | Hostname |
|---|---|---|---|
| **CUSTOMER #1 PILOT** (only approved pilot DB) | Pridmora Pilot | `jfcxnkmflfzzxqovkuqw` | `jfcxnkmflfzzxqovkuqw.supabase.co` |
| **DEVELOPMENT / REFERENCE ONLY** | IDENTITY | `lxfdhnwjmtfbawznivbu` | `lxfdhnwjmtfbawznivbu.supabase.co` |

Rules:

1. Customer #1 rehearsal, accounts, and pilot data may use **Pridmora Pilot only**.
2. Do **not** apply Customer #1 migrations, create Customer #1 accounts, or run pilot rehearsal against IDENTITY.
3. Do **not** modify IDENTITY as part of Customer #1 preparation.
4. If CLI link or app env unexpectedly points at IDENTITY during Customer #1 work: **STOP** — do not mutate.
5. Local env files: use `.env.pilot.local` for Pilot; keep `.env.local` for IDENTITY development and do not overwrite it with Pilot values casually.

---

## 1. Principles

1. Do **not** run blanket `supabase db push` while local and remote migration histories differ.
2. Prefer inspect → review → targeted apply (or repair) over opportunistic sync.
3. Ordinary pilot use should not require developers editing production rows after initial setup.
4. Manager private development remains private; Organisation Lead sees only privacy-safe aggregates.

---

## 2. Required environment variables

Confirm the **Pridmora Pilot** environment has (names only — values live in secure env stores):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Must be `https://jfcxnkmflfzzxqovkuqw.supabase.co` for Customer #1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser anon key for that same project |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged operations for that same project |
| `OPENAI_API_KEY` | Aurelia / AI features (org must also have AI enabled) |
| Site / auth origin vars used by invite email redirects | Invitation acceptance URLs (Pilot app origin) |

Do not commit `.env*` files containing real values.

---

## 3. Supabase / project connection checks

1. Confirm the app points at **Pridmora Pilot** (`jfcxnkmflfzzxqovkuqw`) — URL matches this runbook §0.
2. Confirm service-role and anon keys belong to that same project (not IDENTITY).
3. Confirm CLI `project-ref` is `jfcxnkmflfzzxqovkuqw` before any Pilot migration work.
4. Sign in as a known test account and load Home successfully.
5. Run:

```bash
npm run db:status
```

Record local-vs-remote migration differences before any apply.

### Password recovery (scanner-safe)

Pilot Auth must use the Reset Password email template from  
`supabase/email-templates/recovery.html` so the link lands on:

`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`

(`redirectTo` from the app is `{origin}/auth/reset-password`.)

The page requires an explicit **Continue** before `verifyOtp` (prefetch-safe).  
Do **not** leave the default ConfirmationURL recovery link that hits `/auth/callback` with a single-use PKCE `code` on GET.

| Environment | Site URL / `NEXT_PUBLIC_SITE_URL` |
|---|---|
| Local Pilot rehearsal | `http://127.0.0.1:3001` (or `http://localhost:3001`) |
| Deployed / production app | `https://app.pridmora.com` |

Redirect allowlist should include both production and local Pilot origins for `/auth/**` (including `/auth/reset-password` and `/auth/callback`).  
Do **not** permanently set the Supabase project Site URL to localhost.

---

## 4. Migration status inspection

Known risk pattern:

- Local migrations present that are not on remote
- Remote-only migrations not present locally
- Pending relationship Organisation Intelligence / evidence / owner-console related history

### Required before pilot go-live

1. Capture `npm run db:status` output for the pilot target.
2. Review each pending migration with product/engineering.
3. Apply only through a **controlled reconciliation** plan (ordered apply / repair as approved).
4. Re-run `npm run db:status` and confirm the pilot-required surfaces are available.

### Explicit warning

**Do not** run blanket `supabase db push` / `npm run db:push` while histories differ. That can create irreversible drift.

If reconciliation is unclear: **STOP and escalate** (see §12).

---

## 5. Organisation creation / setup

### Platform owner bootstrap (before Owner Console works)

Migration `20260808120000` creates `platform_owners` but **does not insert** any user. RLS allows select for owners; there is **no** client self-insert policy.

After Owner Console migrations are applied on Pilot:

1. Ensure the intended operator has an `auth.users` row on **Pridmora Pilot** (sign-up / invite on Pilot auth).
2. Insert that user’s `user_id` into `public.platform_owners` with `status = 'active'` via an approved ops SQL path (service role / SQL Editor on Pilot only).
3. Confirm `/owner` opens for that account.

`enquiries@pridmora.com` appears in older auth/profile bootstrap migrations as a preferred demo identity; it is **not** automatically seeded as a platform owner by `20260808120000`.

### Create customer organisation

Via **Owner Console** (platform owner):

1. Create the customer organisation (trial/licence as agreed).
2. Confirmed behaviour: `owner_create_customer_organisation` creates organisation + trial licence/settings and sets `ai_enabled = true` by default — it does **not** seed an organisation membership / org `owner`.
3. Do **not** invite Customer #1 users until Lead membership bootstrap is planned.

---

## 6. Organisation Lead setup

Customer #1 Lead access requires an organisation membership with a role that includes `intelligence.organisation.read` (typically `owner`, `administrator`, or `oversight`).

### Controlled bootstrap

1. Establish the first Lead/admin membership through the approved ops path (Owner Console + any documented membership seed). Owner Console `change_role` does **not** transfer organisation `owner` via the ordinary action — follow the current ops procedure.
2. Confirm the Lead can open:
   - `/organisation` (Overview)
   - `/organisation/manager-development`
   - `/organisation/members` (if their role allows)
3. Confirm a Manager-only account **cannot** open Lead intelligence APIs.

---

## 7. Manager membership / setup

1. Invite Managers with membership role suitable for seat use (commonly `practitioner`) and `professional_role = manager`.
2. Confirm invitation email / accept path works against the pilot auth origin.
3. After accept, Manager should land on Manager Home (need-led front door) even with zero People.

---

## 8. Professional role expectations

| Role signal | Expectation |
|---|---|
| `professional_role = manager` | Manager Home, My Development, private Aurelia |
| Membership `owner` / `administrator` / `oversight` | Organisation workspace + Lead intelligence read |
| Manager alone (no org Lead membership) | Must **not** access Lead MDI/OI APIs |
| Manager + Lead combination | Supported only if membership permissions allow; keep privacy boundaries |

---

## 9. AI enablement

1. Organisation setting: AI enabled at organisation level (`aiEnabled` / equivalent Settings toggle).
2. `OPENAI_API_KEY` present in the runtime environment.
3. Smoke Aurelia for a Manager; failure copy must remain non-technical and must not claim the chat was saved.

---

## 10. Minimum smoke tests

Run after setup (manual or scripted as available):

1. **Manager first-login** — zero People → Manager Home shows “What would help you today?”
2. **Talk something through** — opens private Aurelia; privacy notice visible
3. **Aurelia reply** — short practical reply; refresh clears unsaved chat
4. **My Development** — accessible with no People; set focus
5. **Prepare with zero People** — clear guidance (not an unexplained empty People dump)
6. **Manager Development Intelligence (Lead)** — low-data state; privacy message; no near-threshold counts
7. **People Development Intelligence (Lead)** — separate lens; does not block MDI
8. **Lead permission** — Manager-only account denied Lead APIs
9. **Cross-organisation isolation** — user from Org A cannot read Org B intelligence/members
10. **Owner Console** — still operational metadata only; no private Manager content

Also run automated:

```bash
npm test
npx tsc --noEmit
```

---

## 11. Rollback / escalation

Escalate immediately if:

- migration apply fails or history diverges further
- invitations cannot be accepted
- AI is required for pilot day-one and cannot be enabled safely
- any path exposes Manager private chat, reflections, or individual development to Leads
- cross-organisation data leakage is suspected

Rollback guidance:

1. Stop further migration applies.
2. Preserve `db:status` output and error logs (no PII / no chat content).
3. Restore app deploy to last known-good revision if the regression is application-side.
4. For database issues, follow the approved Supabase restore / repair procedure — do not improvise with blanket push.

---

## 12. Contacts / ownership

Keep named owners outside this repo (ops channel):

- Pilot environment owner
- Migration reconciliation approver
- Customer #1 day-one support contact

---

*End of Customer #1 pilot setup runbook.*
