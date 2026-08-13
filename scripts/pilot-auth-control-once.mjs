#!/usr/bin/env node
/**
 * One-shot Pilot-only password set + signInWithPassword verification.
 * Reads /tmp/pilot-auth-control.pass, never prints it, deletes it afterwards.
 * Target: jfcxnkmflfzzxqovkuqw only.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PILOT_HOST = "jfcxnkmflfzzxqovkuqw.supabase.co";
const USER_ID = "65ddabd2-a06b-4b47-9336-e957c4d5536c";
const EMAIL = "enquiries@pridmora.com";
const PASS_PATH = "/tmp/pilot-auth-control.pass";

function loadPilotEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.pilot.local"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const report = {
  target: null,
  passwordUpdate: null,
  emailConfirmationPreserved: null,
  emailMatches: null,
  userExists: null,
  directSignIn: null,
  authErrorCode: null,
  authErrorMessage: null,
  signedOut: null,
  passwordFileDeleted: null,
  identityUntouched: true,
  productCodeUntouched: true,
};

try {
  const env = loadPilotEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const host = new URL(url).hostname;
  report.target = host;
  if (host !== PILOT_HOST) {
    throw new Error(`TARGET_GATE_FAIL: ${host}`);
  }
  if (!existsSync(PASS_PATH)) {
    throw new Error("PASSWORD_FILE_MISSING");
  }
  const password = readFileSync(PASS_PATH, "utf8");
  const normalised = password.replace(/\r?\n$/, "");
  if (!normalised) throw new Error("PASSWORD_EMPTY");

  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const before = await admin.auth.admin.getUserById(USER_ID);
  if (before.error || !before.data?.user) {
    throw new Error(`USER_LOOKUP_FAIL: ${before.error?.message || "missing"}`);
  }
  if (!before.data.user.email_confirmed_at) {
    throw new Error("EMAIL_NOT_CONFIRMED_BEFORE_UPDATE");
  }

  const updated = await admin.auth.admin.updateUserById(USER_ID, {
    password: normalised,
  });
  if (updated.error) {
    report.passwordUpdate = "FAIL";
    report.authErrorCode = updated.error.code ?? null;
    report.authErrorMessage = updated.error.message ?? null;
    throw new Error(`PASSWORD_UPDATE_FAIL: ${updated.error.message}`);
  }
  report.passwordUpdate = "OK";

  const after = await admin.auth.admin.getUserById(USER_ID);
  if (after.error || !after.data?.user) {
    throw new Error(
      `USER_LOOKUP_AFTER_FAIL: ${after.error?.message || "missing"}`
    );
  }
  const user = after.data.user;
  report.userExists = true;
  report.emailMatches = user.email?.toLowerCase() === EMAIL.toLowerCase();
  report.emailConfirmationPreserved = Boolean(user.email_confirmed_at);

  const signIn = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: normalised,
  });
  if (signIn.error) {
    report.directSignIn = "FAIL";
    report.authErrorCode = signIn.error.code ?? null;
    report.authErrorMessage = signIn.error.message ?? null;
  } else {
    report.directSignIn = "OK";
    const out = await anon.auth.signOut();
    report.signedOut = !out.error;
  }
} catch (err) {
  if (!report.passwordUpdate) report.passwordUpdate = "FAIL";
  if (!report.directSignIn) report.directSignIn = "FAIL";
  if (!report.authErrorMessage) {
    report.authErrorMessage = err instanceof Error ? err.message : String(err);
  }
  process.exitCode = 1;
} finally {
  try {
    if (existsSync(PASS_PATH)) {
      unlinkSync(PASS_PATH);
      report.passwordFileDeleted = true;
    } else {
      report.passwordFileDeleted = false;
    }
  } catch {
    report.passwordFileDeleted = false;
  }
  console.log(JSON.stringify({ source: "pilot_auth_control", ...report }, null, 2));
}
