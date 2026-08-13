# Customer #1 Pilot Setup Runbook

**Status:** Operational guidance for controlled pilot setup  
**Product:** Pridmora Development Platform  
**Related:** [`V1-PILOT-SCOPE.md`](./V1-PILOT-SCOPE.md), Owner Console

This runbook supports a **controlled** Customer #1 pilot. It does not put secrets, credentials, or customer personal data in the repository.

---

## 1. Principles

1. Do **not** run blanket `supabase db push` while local and remote migration histories differ.
2. Prefer inspect → review → targeted apply (or repair) over opportunistic sync.
3. Ordinary pilot use should not require developers editing production rows after initial setup.
4. Manager private development remains private; Organisation Lead sees only privacy-safe aggregates.

---

## 2. Required environment variables

Confirm the pilot environment has (names only — values live in secure env stores):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged operations |
| `OPENAI_API_KEY` | Aurelia / AI features (org must also have AI enabled) |
| Site / auth origin vars used by invite email redirects | Invitation acceptance URLs |

Do not commit `.env*` files containing real values.

---

## 3. Supabase / project connection checks

1. Confirm the app points at the intended pilot project (URL matches the ops record).
2. Confirm service-role and anon keys belong to that same project.
3. Sign in as a known test account and load Home successfully.
4. Run:

```bash
npm run db:status
```

Record local-vs-remote migration differences before any apply.

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

Via **Owner Console** (platform owner):

1. Create the customer organisation (trial/licence as agreed).
2. Note: create-org may **not** seed an organisation `owner` membership automatically.
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
