# Authentication Reliability Charter

This document is the permanent architecture contract for authentication on the Pridmora platform.

**Customer #1 onboarding must remain STOPPED until the Auth Reliability Gate passes.**

## Gate rule (non-negotiable)

Changes that affect any of the following **cannot be considered complete** unless the Auth Reliability Gate passes:

- Auth UI / forms (sign-in, sign-up, recovery, reset)
- Middleware or session cookie handling
- Supabase browser / server / route clients
- Environment configuration (`PRIDMORA_ENV`, Site URL, Supabase URL)
- Invitations or invite email delivery
- Role-aware post-login routing
- Recovery email templates or redirect contracts

### How to run the gate

```bash
# Unit / contract
npm test -- --run \
  tests/auth-environment-isolation.test.ts \
  tests/auth-client-errors.test.ts \
  tests/auth-email-link.test.ts \
  tests/auth-scanner-safe-recovery.test.tsx \
  tests/auth-recovery-routes.test.ts \
  tests/auth-layout.test.tsx \
  tests/auth-middleware-cookies.test.ts \
  tests/post-login-destination.test.ts \
  tests/dev-pilot-script.test.ts

npm run typecheck

# Browser Auth Reliability Gate (Pilot only, disposable fixtures)
npm run auth:reliability-gate
```

`npm run auth:reliability-gate` starts (or reuses) Pilot on `http://127.0.0.1:3001` and runs genuine Playwright browser acceptance.

## Canonical architecture

| Concern | Decision |
|---|---|
| Session storage | Cookie SSR via `@supabase/ssr` |
| Sign-up confirmation | PKCE `code` → `/auth/callback` → `exchangeCodeForSession` |
| Invites (new user) | Supabase `inviteUserByEmail` → accept URL |
| Invites (existing user) | Magic link (`signInWithOtp`) → accept URL — **never** password recovery |
| Password recovery | Scanner-safe `token_hash` → `/auth/reset-password` → Continue → `verifyOtp` → `updateUser` → `signOut` → sign-in |
| Password grant | Browser `signInWithPassword` against `*.supabase.co` |
| Post-auth navigation | **Hard** `window.location.assign` after auth mutations |
| Post-login destination | Shared authoritative resolver (`lib/auth/post-login-destination.ts`) |

## Environment isolation (fail closed)

| File / command | Project | Canonical origin |
|---|---|---|
| `npm run dev` → `scripts/dev-identity.mjs` + `.env.local` | IDENTITY `lxfdhnwjmtfbawznivbu` | `http://127.0.0.1:3000` |
| `npm run dev:pilot` → `scripts/dev-pilot.mjs` + `.env.pilot.local` | Pilot `jfcxnkmflfzzxqovkuqw` | `http://127.0.0.1:3001` |
| Production Identity (`PRIDMORA_ENV=identity`) | IDENTITY `lxfdhnwjmtfbawznivbu` | `https://platform.pridmora.com` |
| Production Pilot (`PRIDMORA_ENV=pilot`) | Pilot `jfcxnkmflfzzxqovkuqw` | `https://pilot.pridmora.com` |

Rules:

- Pilot and IDENTITY must never silently fall back to each other.
- `localhost` is forbidden for auth Site URL (cookie jar ≠ `127.0.0.1`).
- `instrumentation.ts` + boot scripts validate declared env, project ref, and canonical origin before serving traffic.
- When `PRIDMORA_ENV` / `PRIDMORA_EXPECTED_SUPABASE_REF` is set, mismatch **prevents startup**.

## Role-aware destinations (existing role architecture)

| Actor | Destination |
|---|---|
| Platform Owner (`platform_owners`) | `/owner` |
| Organisation Lead (`role = oversight`, `professional_role = null`) | `/organisation` |
| Manager (`role = practitioner`, `professional_role = manager`) | `/?view=dashboard` |

Do **not** create `professional_role = lead`. Do not invent new membership roles for routing.

Deep links (e.g. invitation accept) win over role defaults when `next` is a non-home path.

## Recovery vs invitations

| Flow | Email contract | `redirectTo` |
|---|---|---|
| Password recovery | Recovery template (`recovery.html`) | `/auth/reset-password` |
| Organisation invite (new) | Invite template | Accept URL |
| Organisation invite (existing) | Magic-link / OTP email | Accept URL |

These contracts must not compete. Existing-user invites must never call `resetPasswordForEmail`.

Accept-page landing helpers must live in a **client-safe** module (`lib/organisations/invitation-landing.ts`). Never import `lib/organisations/invitations.ts` (Node `crypto`) from client components — that breaks the accept bundle.

**Manual dashboard step (Pilot):** paste `supabase/email-templates/recovery.html` into Authentication → Email Templates → Reset password. Deploy does not apply it automatically.

**Brevo:** disable click tracking on Auth/transactional templates.

## Session hardening

- Middleware refreshes cookies via `getUser()`.
- Invalid refresh clears **only** `sb-<current-project-ref>-*` cookies (never the other project).
- `/` renders marketing when server session is null; authenticated users enter `HomeApp`.

## Safe observability

- Map Auth errors to stable public codes (`AUTH_INVALID_CREDENTIALS`, `AUTH_REJECTED`, …).
- Never treat every HTTP 400 as wrong password.
- Never log passwords, tokens, JWTs, cookies, anon keys, service-role keys, or recovery secrets.

## Browser acceptance (required)

The gate must prove, in a real browser against Pilot:

1. Platform Owner sign-in → `/owner`
2. Lead sign-in → `/organisation`
3. Manager sign-in → Manager workspace
4. Hard refresh retains session
5. New tab retains session
6. Direct protected URL recognises session
7. Sign-out destroys session
8. Subsequent sign-in works
9. Invalid password → safe error (`AUTH_INVALID_CREDENTIALS`)
10. Password recovery end-to-end; new password works; old password fails
11. Lead invitation acceptance → correct membership/workspace
12. Manager invitation acceptance → correct membership/workspace
13. Env isolation: Pilot boot refuses IDENTITY configuration (and vice versa)

## Safety boundaries

- Do not mutate IDENTITY data from Pilot tooling.
- Do not change customer passwords during diagnosis.
- Do not weaken RLS/privacy.
- Do not change the role architecture.
- Do not send Customer #1 invitations from automated gates (use disposable fixtures only).
