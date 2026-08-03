# Pridmora Development Platform — Version 1 Working Beta

A functional Next.js application for professional coaches supporting clients through professional identity transition.

## Included

- Supabase Auth (sign up, sign in, email verification, password reset)
- Coach profiles with Row Level Security
- Today, Clients, Coach Space, Session Workspace
- Client Intelligence and Development Journey
- Coaching reports
- Supabase persistence for clients, sessions and client items (per authenticated coach)
- Responsive desktop and mobile layouts

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.local.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for AI features)
- `SUPABASE_SERVICE_ROLE_KEY` (optional; not used for normal app data — keep server-only)

## Database

1. Apply `supabase/schema.sql` for a fresh project, **or**
2. Apply `supabase/migrations/20260724160000_auth_profiles_rls.sql` on an existing project (ID-019).

In the Supabase dashboard Auth settings, add redirect URLs:

- `http://localhost:3000/auth/callback`
- your production `/auth/callback`

Password reset emails must use the token-hash confirm route (see
`supabase/email-templates/recovery.html`). Apply that template manually in the
Supabase dashboard — it is not deployed automatically.

## Auth notes

- Unauthenticated visitors are redirected to `/auth/sign-in`.
- After sign-in, coaches land on Today with their profile name in the sidebar.
- Coaching data APIs require a valid session and are scoped by `auth.uid()` / RLS.

## Product guardrails

- AI supports but does not replace coach judgement.
- No diagnosis.
- No client scoring.
- No automated decisions.
- AI output remains draft until approved by the coach.
