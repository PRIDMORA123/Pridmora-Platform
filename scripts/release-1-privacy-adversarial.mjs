import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PILOT_REF = 'jfcxnkmflfzzxqovkuqw';
const IDENTITY_REF = 'lxfdhnwjmtfbawznivbu';
const PILOT_HOST = `${PILOT_REF}.supabase.co`;
const ENV_FILE = '.env.pilot.local';

function loadEnv(file) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}`);
  for (const raw of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPilot() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  assert(url, 'Missing Pilot Supabase URL');
  assert(service, 'Missing Pilot service role key');
  assert(anon, 'Missing Pilot anon key');
  const host = new URL(url).host;
  assert(host === PILOT_HOST, `Refusing non-Pilot host: ${host}`);
  assert(!url.includes(IDENTITY_REF), 'Refusing IDENTITY/Production project');
  return { url, service, anon };
}

function requireWriteGate() {
  assert(process.env.RELEASE1_PRIVACY_ADVERSARIAL === '1', 'Set RELEASE1_PRIVACY_ADVERSARIAL=1 to allow disposable Pilot writes');
}

function supa(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function safeError(error) {
  if (!error) return null;
  return { message: error.message, code: error.code, status: error.status };
}

async function createUser(admin, anonKey, url, label) {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const email = `r1-privacy-${label}-${suffix}@pridmora-pilot.test`;
  const password = `P1!${crypto.randomBytes(18).toString('base64url')}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `R1 Privacy ${label}` },
  });
  assert(!error && data?.user?.id, `create ${label}: ${safeError(error)?.message || 'no user id'}`);

  const client = supa(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  assert(!signInError, `sign in ${label}: ${safeError(signInError)?.message}`);
  return { id: data.user.id, email, password, client };
}

async function createOrg(admin, creatorId, name) {
  const { data, error } = await admin
    .from('organisations')
    .insert({
      name,
      organisation_type: 'business',
      status: 'active',
      created_by: creatorId,
    })
    .select('id')
    .single();
  assert(!error && data?.id, `create organisation ${name}: ${safeError(error)?.message}`);
  return data.id;
}

async function addMembership(admin, orgId, userId, role, professionalRole = null) {
  const row = {
    organisation_id: orgId,
    user_id: userId,
    role,
    status: 'active',
  };
  if (professionalRole) row.professional_role = professionalRole;
  const { error } = await admin.from('organisation_memberships').insert(row);
  assert(!error, `membership ${role}/${professionalRole || '-'}: ${safeError(error)?.message}`);
}

async function captureAutoCreatedRecords(admin, userId, protectedOrgIds) {
  const captured = { profileId: null, personalOrganisationIds: [], personalMembershipIds: [] };
  const { data: profile, error: profileError } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  assert(!profileError, `capture profile: ${safeError(profileError)?.message}`);
  if (profile?.id) captured.profileId = profile.id;

  const { data: orgs, error: orgError } = await admin.from('organisations')
    .select('id,organisation_type,created_by').eq('created_by', userId).eq('organisation_type', 'personal');
  assert(!orgError, `capture personal organisations: ${safeError(orgError)?.message}`);
  for (const org of orgs ?? []) {
    assert(!protectedOrgIds.includes(org.id), 'Refusing to treat test business organisation as personal cleanup target');
    const { data: members, error: memberError } = await admin.from('organisation_memberships')
      .select('id,user_id').eq('organisation_id', org.id);
    assert(!memberError, `capture personal memberships: ${safeError(memberError)?.message}`);
    assert((members ?? []).every((row) => row.user_id === userId), 'Refusing cleanup of personal organisation with foreign member');
    captured.personalOrganisationIds.push(org.id);
    captured.personalMembershipIds.push(...(members ?? []).map((row) => row.id).filter(Boolean));
  }
  return captured;
}

async function callHelper(client, clientId, requestedUserId) {
  const { data, error } = await client.rpc('user_can_access_client_content', {
    p_client_id: clientId,
    p_user_id: requestedUserId,
  });
  return { data, error };
}

async function readPrivate(client, clientId) {
  const { data, error } = await client
    .from('client_private_identities')
    .select('client_id,real_name,email,phone,private_notes')
    .eq('client_id', clientId);
  return { data, error };
}

async function createConfidentialRelationship(managerClient, orgId, runId) {
  const { data, error } = await managerClient.rpc('create_coaching_relationship', {
    p_organisation_id: orgId,
    p_identity_mode: 'confidential',
    p_name: '',
    p_display_label: `R1 Private ${runId}`,
    p_role: 'Manager',
    p_organisation_label: 'Release 1 Privacy Adversarial',
    p_email: null,
    p_current_focus: 'Privacy boundary verification',
    p_ai_name_allowed: false,
    p_initials: 'RP',
    p_private_real_name: `Private Person ${runId}`,
    p_private_email: `private-${runId}@example.invalid`,
    p_private_phone: '00000000000',
    p_private_notes: `Release 1 privacy adversarial ${runId}`,
  });
  assert(!error, `create confidential relationship RPC error: ${safeError(error)?.message}`);
  assert(data?.ok === true && data?.clientId, `create confidential relationship failed: ${JSON.stringify(data)}`);
  return data.clientId;
}

async function exactCleanup(admin, state) {
  const failures = [];
  const attempt = async (label, fn) => {
    try { await fn(); } catch (e) { failures.push(`${label}: ${e.message}`); }
  };

  if (state.clientId) {
    await attempt('delete private identity', async () => {
      const { error } = await admin.from('client_private_identities').delete().eq('client_id', state.clientId);
      if (error) throw error;
    });
    await attempt('delete relationship assignments', async () => {
      const { error } = await admin.from('relationship_assignments').delete().eq('client_id', state.clientId);
      if (error) throw error;
    });
    await attempt('delete client', async () => {
      const { error } = await admin.from('clients').delete().eq('id', state.clientId);
      if (error) throw error;
    });
  }

  for (const orgId of [...state.orgIds].reverse()) {
    await attempt(`delete memberships ${orgId}`, async () => {
      const { error } = await admin.from('organisation_memberships').delete().eq('organisation_id', orgId);
      if (error) throw error;
    });
    await attempt(`delete organisation ${orgId}`, async () => {
      const { error } = await admin.from('organisations').delete().eq('id', orgId);
      if (error) throw error;
    });
  }

  for (const userId of [...state.userIds].reverse()) {
    const captured = state.personalByUser.get(userId) || { profileId: null, personalOrganisationIds: [], personalMembershipIds: [] };
    for (const membershipId of captured.personalMembershipIds) {
      await attempt(`delete personal membership ${membershipId}`, async () => {
        const { error } = await admin.from('organisation_memberships').delete().eq('id', membershipId).eq('user_id', userId);
        if (error) throw error;
      });
    }
    for (const orgId of captured.personalOrganisationIds) {
      await attempt(`delete personal organisation ${orgId}`, async () => {
        const { data: org, error: readError } = await admin.from('organisations')
          .select('id,organisation_type,created_by').eq('id', orgId).maybeSingle();
        if (readError) throw readError;
        if (!org) return;
        if (org.organisation_type !== 'personal' || org.created_by !== userId || state.orgIds.includes(orgId)) {
          throw new Error('guard refused');
        }
        const { error } = await admin.from('organisations').delete().eq('id', orgId).eq('created_by', userId).eq('organisation_type', 'personal');
        if (error) throw error;
      });
    }
    if (captured.profileId === userId) {
      await attempt(`delete profile ${userId}`, async () => {
        const { error } = await admin.from('profiles').delete().eq('id', userId);
        if (error) throw error;
      });
    }
    await attempt(`delete auth user ${userId}`, async () => {
      let result = await admin.auth.admin.deleteUser(userId);
      if (result.error) result = await admin.auth.admin.deleteUser(userId, true);
      if (result.error) throw result.error;
    });
  }

  if (failures.length) throw new Error(`Cleanup failures:\n${failures.join('\n')}`);
}

loadEnv(ENV_FILE);
const { url, service, anon } = assertPilot();
requireWriteGate();

const admin = supa(url, service);
const anonClient = supa(url, anon);
const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const state = { userIds: [], orgIds: [], clientId: null, personalByUser: new Map() };
let mainError = null;

try {
  const managerA = await createUser(admin, anon, url, 'manager-a');
  const managerB = await createUser(admin, anon, url, 'manager-b');
  const lead = await createUser(admin, anon, url, 'lead');
  const managerOther = await createUser(admin, anon, url, 'manager-other');
  state.userIds.push(managerA.id, managerB.id, lead.id, managerOther.id);
  for (const user of [managerA, managerB, lead, managerOther]) {
    state.personalByUser.set(user.id, await captureAutoCreatedRecords(admin, user.id, []));
  }

  const orgA = await createOrg(admin, managerA.id, `R1 Privacy Org A ${runId}`);
  const orgB = await createOrg(admin, managerOther.id, `R1 Privacy Org B ${runId}`);
  state.orgIds.push(orgA, orgB);

  await addMembership(admin, orgA, managerA.id, 'practitioner', 'manager');
  await addMembership(admin, orgA, managerB.id, 'practitioner', 'manager');
  await addMembership(admin, orgA, lead.id, 'oversight');
  await addMembership(admin, orgB, managerOther.id, 'practitioner', 'manager');

  const clientId = await createConfidentialRelationship(managerA.client, orgA, runId);
  state.clientId = clientId;

  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    assert(ok, `${name}${detail ? `: ${detail}` : ''}`);
  };

  const ownRead = await readPrivate(managerA.client, clientId);
  record('Manager A can read own private identity', !ownRead.error && ownRead.data?.length === 1 && ownRead.data[0].real_name === `Private Person ${runId}`,
    ownRead.error ? safeError(ownRead.error).message : `rows=${ownRead.data?.length ?? 0}`);

  const sameOrgRead = await readPrivate(managerB.client, clientId);
  record('Manager B same organisation cannot read Manager A private identity', !sameOrgRead.error && Array.isArray(sameOrgRead.data) && sameOrgRead.data.length === 0,
    sameOrgRead.error ? safeError(sameOrgRead.error).message : `rows=${sameOrgRead.data?.length ?? 0}`);

  const leadRead = await readPrivate(lead.client, clientId);
  record('Organisation Lead cannot read Manager A private identity', !leadRead.error && Array.isArray(leadRead.data) && leadRead.data.length === 0,
    leadRead.error ? safeError(leadRead.error).message : `rows=${leadRead.data?.length ?? 0}`);

  const otherOrgRead = await readPrivate(managerOther.client, clientId);
  record('Different-organisation Manager cannot read Manager A private identity', !otherOrgRead.error && Array.isArray(otherOrgRead.data) && otherOrgRead.data.length === 0,
    otherOrgRead.error ? safeError(otherOrgRead.error).message : `rows=${otherOrgRead.data?.length ?? 0}`);

  const unauthRead = await readPrivate(anonClient, clientId);
  record('Unauthenticated caller cannot read private identity', unauthRead.error != null || (Array.isArray(unauthRead.data) && unauthRead.data.length === 0),
    unauthRead.error ? safeError(unauthRead.error).message : `rows=${unauthRead.data?.length ?? 0}`);

  const ownHelper = await callHelper(managerA.client, clientId, managerA.id);
  record('Manager A helper access returns true', !ownHelper.error && ownHelper.data === true,
    ownHelper.error ? safeError(ownHelper.error).message : `result=${String(ownHelper.data)}`);

  const spoof = await callHelper(managerB.client, clientId, managerA.id);
  record('Manager B cannot impersonate Manager A via p_user_id', !spoof.error && spoof.data === false,
    spoof.error ? safeError(spoof.error).message : `result=${String(spoof.data)}`);

  const leadHelper = await callHelper(lead.client, clientId, lead.id);
  record('Organisation Lead helper access returns false', !leadHelper.error && leadHelper.data === false,
    leadHelper.error ? safeError(leadHelper.error).message : `result=${String(leadHelper.data)}`);

  const crossHelper = await callHelper(managerOther.client, clientId, managerOther.id);
  record('Different-organisation Manager helper access returns false', !crossHelper.error && crossHelper.data === false,
    crossHelper.error ? safeError(crossHelper.error).message : `result=${String(crossHelper.data)}`);

  console.log(`\nRelease 1 privacy adversarial outcome: PASS (${checks.length}/${checks.length})`);
} catch (error) {
  mainError = error;
  console.error(`\nRelease 1 privacy adversarial outcome: FAIL — ${error.message}`);
} finally {
  try {
    await exactCleanup(admin, state);
    console.log('Cleanup: PASS');
  } catch (cleanupError) {
    console.error(`Cleanup: FAIL — ${cleanupError.message}`);
    mainError = mainError || cleanupError;
  }
}

if (mainError) process.exitCode = 1;
