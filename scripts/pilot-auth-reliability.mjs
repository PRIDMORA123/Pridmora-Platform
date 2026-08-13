#!/usr/bin/env node
/**
 * Pilot-only authentication reliability control + disposable recovery E2E.
 *
 * Uses .env.pilot.local exclusively. Never prints secrets or passwords.
 * Creates a disposable Auth user, proves password auth, runs two recovery
 * cycles via admin generateLink (scanner-safe token_hash path), then deletes
 * the disposable user.
 *
 * Does NOT mutate Customer #1 organisation memberships or platform_owners.
 * Does NOT touch IDENTITY.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PILOT_REF = "jfcxnkmflfzzxqovkuqw";
const IDENTITY_REF = "lxfdhnwjmtfbawznivbu";

function loadPilotEnv() {
  const path = resolve(process.cwd(), ".env.pilot.local");
  if (!existsSync(path)) {
    throw new Error("Missing .env.pilot.local");
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function assertPilot(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
  const host = new URL(url).hostname;
  if (host !== `${PILOT_REF}.supabase.co`) {
    throw new Error(`TARGET_GATE_FAIL host=${host}`);
  }
  if (host.includes(IDENTITY_REF)) {
    throw new Error("IDENTITY_TOUCH_FORBIDDEN");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Missing Pilot Auth keys");
  }
}

function makePassword(label) {
  return `Prid-${label}-${randomBytes(12).toString("base64url")}!9`;
}

function extractTokenHash(actionLink) {
  const url = new URL(actionLink);
  const hash = url.searchParams.get("token_hash");
  if (hash) return hash;
  // Some generateLink shapes put values in the fragment or nested redirect.
  const redirectTo = url.searchParams.get("redirect_to");
  if (redirectTo) {
    try {
      const nested = new URL(redirectTo);
      const nestedHash = nested.searchParams.get("token_hash");
      if (nestedHash) return nestedHash;
    } catch {
      // ignore
    }
  }
  // ConfirmationURL-style: token may be in query as token
  const token = url.searchParams.get("token");
  if (token) return token;
  throw new Error("generateLink missing token_hash");
}

async function main() {
  const report = {
    target: null,
    passwordSignIn: null,
    recovery1: null,
    recovery2: null,
    oldPasswordRejected: null,
    newPasswordAccepted: null,
    disposableDeleted: null,
    identityUntouched: true,
  };

  const env = loadPilotEnv();
  assertPilot(env);
  report.target = `${PILOT_REF}.supabase.co`;

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now().toString(36);
  const email = `auth.reliability.${stamp}@pridmora-pilot.test`;
  const password1 = makePassword("one");
  const password2 = makePassword("two");
  const password3 = makePassword("three");

  let userId = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password: password1,
      email_confirm: true,
      user_metadata: {
        full_name: "Auth Reliability Disposable",
        purpose: "pilot-auth-reliability",
      },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`createUser failed: ${created.error?.message || "unknown"}`);
    }
    userId = created.data.user.id;

    // Phase 4 — direct password auth
    const signIn1 = await anon.auth.signInWithPassword({ email, password: password1 });
    if (signIn1.error) {
      report.passwordSignIn = {
        ok: false,
        code: signIn1.error.code ?? null,
        message: signIn1.error.message,
      };
      throw new Error(`signInWithPassword failed: ${signIn1.error.message}`);
    }
    report.passwordSignIn = { ok: true };
    await anon.auth.signOut();

    async function runRecoveryCycle(fromPassword, toPassword, label) {
      const link = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (link.error || !link.data?.properties?.action_link) {
        throw new Error(`${label} generateLink failed: ${link.error?.message}`);
      }
      const tokenHash = extractTokenHash(link.data.properties.action_link);

      const verify = await anon.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (verify.error) {
        throw new Error(`${label} verifyOtp failed: ${verify.error.message}`);
      }

      const updated = await anon.auth.updateUser({ password: toPassword });
      if (updated.error) {
        throw new Error(`${label} updateUser failed: ${updated.error.message}`);
      }
      await anon.auth.signOut();

      const oldTry = await anon.auth.signInWithPassword({
        email,
        password: fromPassword,
      });
      const oldRejected = Boolean(oldTry.error);
      if (!oldTry.error) await anon.auth.signOut();

      const newTry = await anon.auth.signInWithPassword({
        email,
        password: toPassword,
      });
      if (newTry.error) {
        throw new Error(`${label} new password sign-in failed: ${newTry.error.message}`);
      }
      await anon.auth.signOut();

      return { ok: true, oldRejected, newAccepted: true };
    }

    const cycle1 = await runRecoveryCycle(password1, password2, "recovery1");
    report.recovery1 = { ok: cycle1.ok };
    report.oldPasswordRejected = cycle1.oldRejected;
    report.newPasswordAccepted = cycle1.newAccepted;

    const cycle2 = await runRecoveryCycle(password2, password3, "recovery2");
    report.recovery2 = { ok: cycle2.ok };
    report.oldPasswordRejected = report.oldPasswordRejected && cycle2.oldRejected;
    report.newPasswordAccepted = report.newPasswordAccepted && cycle2.newAccepted;

    console.log(
      JSON.stringify(
        {
          source: "pilot_auth_reliability",
          outcome: "PASS",
          ...report,
          // Never include email/password/userId in CI logs if avoidable — keep id for cleanup audit only.
          disposableUserId: userId,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "pilot_auth_reliability",
        outcome: "FAIL",
        ...report,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    process.exitCode = 1;
  } finally {
    if (userId) {
      // Soft-delete then hard-delete; treat "already gone" as success.
      let deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) {
        deleted = await admin.auth.admin.deleteUser(userId, true);
      }
      const message = String(deleted.error?.message ?? "").toLowerCase();
      const gone =
        !deleted.error ||
        message.includes("not found") ||
        message.includes("user not found") ||
        Object.keys(deleted.error || {}).length === 0;
      report.disposableDeleted = gone;
      if (!gone) {
        console.error(
          JSON.stringify({
            source: "pilot_auth_reliability",
            outcome: "CLEANUP_FAIL",
            message: deleted.error?.message ?? "deleteUser failed",
          })
        );
        process.exitCode = 1;
      } else if (process.exitCode !== 1) {
        process.exitCode = 0;
      }
    }
  }
}

main();
