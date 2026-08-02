# Pridmora Development Platform — Version 1 Pilot Scope

**Status:** Locked for pilot-readiness  
**Product:** Pridmora Development Platform  
**Company:** Pridmora Ltd  
**Related:** [`PRODUCT_SCOPE.md`](../PRODUCT_SCOPE.md), [`README.md`](../README.md)

This document records what Version 1 includes for controlled pilot use, what is known to be limited, and what is deliberately deferred. It is the release boundary for pilot-readiness work.

---

## Pilot-readiness rule

**No new feature may be introduced during pilot-readiness work unless it resolves a confirmed pilot blocker.**

A confirmed pilot blocker is a defect or gap that:

1. prevents a pilot practitioner or organisation lead from completing an approved journey step; or
2. creates a security, confidentiality, data-integrity, or accessibility failure in an approved path; or
3. has been explicitly accepted by product as blocking pilot start.

During pilot-readiness:

- Prefer defect fixes, reliability, security hardening, copy/clarity repair, and verification.
- Do not expand scope with “nice to have” capabilities, redesigns, or adjacent product ideas.
- If a change is proposed as a blocker fix, name the blocked approved journey step or risk before implementing.
- Features listed under [Deliberately deferred](#deliberately-deferred) remain out of scope unless promoted through an explicit scope decision after pilot.

Version 1 product rule (unchanged):

> A feature must help the practitioner prepare, coach or reflect. Otherwise it is outside scope.

---

## Approved practitioner journey

The practitioner (coaching) workspace is approved and must remain functionally intact for ordinary practitioners. Solo users must not be forced through organisation administration to continue working.

### Primary application surfaces

| Surface | Purpose |
| --- | --- |
| Authentication | Sign up, sign in, email verification, password reset |
| Home | Next best action, practice overview, conversations in progress, relationship portfolio; first-use welcome when no relationships exist |
| People | Create and manage developmental relationships |
| Relationship workspace (Coach Space) | Six-stage coaching journey for one person |
| Settings | Practitioner preferences (including preparation support) |
| Professional principles | Product / professional stance |

Organisation administration is a **separate** area and must not be mixed into this journey.

### First-use path

1. Create the coaching relationship (person + purpose).
2. Prepare for the conversation.
3. Coach and reflect (capture what mattered).
4. Understand development over time.

Onboarding is brief and derived from real account data. No long product tours, compulsory videos, gamification, or percentage completion scores.

### Six-stage relationship journey

Visible architecture for each developmental relationship:

1. **Current Position** — where the person is now and what needs attention next  
2. **Prepare** — Preparation Brief for the next development conversation  
3. **Session Notes** — capture the current conversation  
4. **Summary & Insights** — optional review of AI-organised evidence before approval  
5. **Development** — longitudinal development picture and updates  
6. **Reports** — formal development reports  

Supporting capabilities inside this journey:

- Coaching Moments (lightweight relationship interactions)
- Development Journey narrative (evidence from approved sessions)
- Client intelligence content: professional identity summary, strengths, values, goals, actions, themes, key quotes, coach insight
- Preparation-style preferences (practitioner default; optional per-person override)

### Approved end-to-end workflow

1. Authenticate  
2. Land on Home / Today with a clear next action  
3. Create or open a person (coaching relationship)  
4. Agree coaching purpose where needed  
5. Prepare (create / update / confirm Preparation Brief)  
6. Conduct the development conversation and capture Session Notes  
7. Optionally create and review Summary & Insights; approve before intelligence is treated as settled  
8. Reflect between conversations as needed  
9. Apply Development Updates when evidence supports them  
10. Review Development Journey and generate Reports when required  

### AI and professional judgement (locked)

- AI supports but does not replace practitioner judgement.
- No diagnosis, client scoring, or automated decisions.
- AI output remains draft until approved by the practitioner.
- Evidence before certainty.

---

## Organisation features (approved)

Organisation and multi-user foundation is approved for pilot where implemented. Confidential coaching content remains restricted to authorised relationship practitioners.

### Tenancy model

- Every account belongs to at least one organisation.
- Independent practitioners receive a **personal organisation** automatically (no forced setup flow).
- Existing relationships, sessions, summaries, patterns and reports remain available after migration into the personal organisation.
- Users may belong to more than one organisation; workspace switching must clear relationship state and prevent cross-organisation leakage.

### Membership roles (permission roles)

| Role | Visible purpose |
| --- | --- |
| Owner | Full organisation administration and commercial control |
| Administrator | Members, assignments and operational settings |
| Oversight | Safe operational information only — no confidential coaching content |
| Practitioner | Assigned developmental relationships |
| Viewer | Explicitly shared organisation-level information |

Professional identity (`coach`, `manager`, `mentor`, `facilitator`, `supervisor`, `other`) is separate from permission role. Do not rename Practitioner to Coach in permission logic.

### Assignment roles

`primary`, `co_practitioner`, `cover`, `supervisor`

- Confidential coaching content requires a content-capable membership role **and** an active content-granting assignment.
- Supervisor assignment does **not** automatically grant private notes.
- On transfer (v1 default): the new practitioner may access the formal relationship record, not previous practitioner-only private notes.

### Organisation Workspace pages

| Page | In pilot scope |
| --- | --- |
| Overview | Safe operational metrics and confidentiality note |
| Members | Invite, role change, deactivate / reactivate (no user deletion for org removal) |
| Assignments | Assign, transfer primary, temporary cover, end assignment |
| Usage | Safe usage / AI operation counts |
| Settings | Name, type, default preparation approach, org AI on/off, retention label, branding placeholder status |

Invitations: email invite with hashed single-use token, expiry, revoke/resend, no role escalation.

### Safe oversight (allowed)

Aggregated operational counts only, for example:

- active members and practitioners  
- active relationships  
- conversations this month  
- awaiting session notes / summaries awaiting review  
- preparation usage, development updates completed, report counts  
- AI operation counts  

### Confidentiality (locked)

Organisation owners and administrators must **not** automatically see:

- session notes  
- private reflections / private notes  
- unapproved AI drafts  
- confidential qualitative coaching narrative  

Administrators may manage members and assignments without receiving coaching-content access unless also assigned.

---

## Known limitations

These are accepted for pilot unless elevated to a confirmed pilot blocker:

1. **Not every secondary form** has unsaved-change protection (Preparation and Session Workspace are covered).
2. **Focus management** uses a shared in-house helper; no Radix/Headless UI focus-trap library is required for V1.
3. **Pilot fixtures** (`lib/pilot-fixtures.ts`) are development/acceptance aids only and are not seeded into production.
4. **Residual legacy wording** (for example “Session” or internal “Identity” namespaces) may remain in comments, PDF internals, CSS namespaces, API paths, or database identifiers; visible product brand is Pridmora Development Platform.
5. **Organisation branding** is placeholder status only — no extensive custom branding UI.
6. **Billing permission** may exist in the permission model; Billing UI is not part of the Organisation Workspace navigation.
7. **Organisation data export / closure** architecture may be prepared; full automated organisation deletion and commercial export builders are not pilot deliverables.
8. **Coach_id transition**: ownership reads assignments; legacy `coach_id` may still exist during a transition period and must not be destructively removed without a later verified migration.
9. **Ambiguous ownership rows** from organisation migration may require review (`organisation_migration_review`) rather than silent guessing.
10. **Summary & Insights** is optional in the journey; preparation and notes remain usable when AI is unavailable.

---

## Deliberately deferred

Do not build these during pilot-readiness. Record only as post-pilot possibilities unless a separate scope decision promotes them.

### Product / practitioner

- Automatic preference recommendations  
- Coach-behaviour tracking  
- Coach–client messaging  
- Calendar integrations  
- Payment subscriptions / commercial billing UI  
- White-label / extensive custom branding  
- Advanced export builders  
- Custom coaching methodologies  
- Badges or gamification  
- Marketplace functionality  
- Native mobile applications  
- New AI capabilities beyond the approved prepare / summary / development / report / pattern flows  
- Long product tours, compulsory video onboarding, or percentage-based onboarding scores  

### Organisation / enterprise

- Billing screens in Organisation Workspace  
- Departments / hierarchical org structures  
- SSO  
- Organisation-level prompt customisation  
- Organisation-wide development themes or development conclusions  
- Broad enterprise analytics  
- Confidential coaching analytics for administrators  
- Executive insights products  
- Practitioner scoring or league tables  
- Organisation-wide psychological themes, performance risk, employee sentiment, or individual development scores  
- Automatic exposure of private notes on relationship transfer beyond the v1 default  

---

## Scope change control

| Change type | Allowed in pilot-readiness? |
| --- | --- |
| Fix defect on an approved path | Yes |
| Security / confidentiality / RLS / ownership repair | Yes |
| Copy, accessibility, responsive repair that does not add capability | Yes |
| Verification, fixtures for QA, documentation | Yes |
| New capability not required to unblock pilot | **No** |
| Deferred item from this document | **No** (unless explicitly re-scoped) |

When in doubt, do not ship the feature. Re-confirm against this document and the pilot-readiness rule above.
