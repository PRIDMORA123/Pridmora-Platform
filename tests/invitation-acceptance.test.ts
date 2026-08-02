import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  acceptOrganisationInvitation,
  hashInvitationToken,
  InvitationAcceptError,
  INVITATION_ACCEPT_ERROR_CODES,
  invitationAcceptErrorMessage,
} from "@/lib/organisations/invitations";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("invitation acceptance repair", () => {
  const migrationPath =
    "supabase/migrations/20260802210000_repair_invitation_acceptance.sql";

  it("ships an idempotent SECURITY DEFINER accept RPC migration", () => {
    expect(existsSync(join(root, migrationPath))).toBe(true);
    const sql = read(migrationPath);

    expect(sql).toContain("create or replace function public.accept_organisation_invitation");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public,\s*extensions,\s*pg_temp/i);
    expect(sql).toContain(
      "grant execute on function public.accept_organisation_invitation(text) to authenticated"
    );
    expect(sql).toContain(
      "revoke all on function public.accept_organisation_invitation(text) from public"
    );
    expect(sql).toContain(
      "revoke all on function public.accept_organisation_invitation(text) from anon"
    );
  });

  it("does not broaden membership INSERT policies for invitees", () => {
    const repair = read(migrationPath);
    const foundation = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );

    expect(repair.toLowerCase()).not.toContain('create policy "memberships insert');
    expect(foundation).toContain("Memberships insert manage");
    expect(foundation).toContain("members.manage");
    expect(foundation).toContain("role = 'owner'");
  });

  it("copies invitation role values and rejects client-chosen org/role fields", () => {
    const sql = read(migrationPath);
    expect(sql).toContain("v_invite.role");
    expect(sql).toContain("v_invite.professional_role");
    expect(sql).toContain("v_invite.organisation_id");
    expect(sql).toContain("user_id = v_uid");
    expect(sql).not.toMatch(/p_organisation_id|p_role|p_user_id/);
  });

  it("enforces pending, expiry, email match, and single-use consumption", () => {
    const sql = read(migrationPath);
    expect(sql).toContain("INVITATION_INVALID");
    expect(sql).toContain("INVITATION_EXPIRED");
    expect(sql).toContain("INVITATION_ALREADY_USED");
    expect(sql).toContain("INVITATION_EMAIL_MISMATCH");
    expect(sql).toContain("INVITATION_MEMBERSHIP_EXISTS");
    expect(sql).toContain("for update");
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("expires_at <= now()");
    expect(sql).toContain("email_confirmed_at");
    expect(sql).toContain("status = 'accepted'");
  });

  it("records safe audit metadata without exposing token hashes", () => {
    const sql = read(migrationPath);
    expect(sql).toContain("organisation_audit_log");
    expect(sql).toContain("member_joined");
    expect(sql).toContain("'via', 'accept_organisation_invitation'");
    expect(sql).not.toMatch(/return.*token_hash/i);
    expect(sql).not.toMatch(/jsonb_build_object\([^\)]*token_hash/);
  });

  it("keeps Owner/Admin invitation creation path intact", () => {
    const invitations = read("lib/organisations/invitations.ts");
    const route = read("app/api/organisations/invitations/route.ts");
    expect(invitations).toContain("createOrganisationInvitation");
    expect(invitations).toContain("canAssignRole");
    expect(route).toContain("members.invite");
    expect(route).toContain("createOrganisationInvitation");
  });

  it("accept API uses authenticated user + RPC, not direct membership insert", () => {
    const invitations = read("lib/organisations/invitations.ts");
    const route = read("app/api/organisations/invitations/route.ts");

    expect(invitations).toContain("accept_organisation_invitation");
    expect(invitations).toContain(".rpc(");
    expect(invitations).not.toMatch(
      /\.from\(\s*["']organisation_memberships["']\s*\)[\s\S]{0,80}\.upsert/
    );
    expect(route).toContain("requireAuthenticatedUser");
    expect(route).toContain('action === "accept"');
    expect(route).toContain("InvitationAcceptError");

    const acceptIdx = route.indexOf('action === "accept"');
    const orgContextIdx = route.indexOf(
      "const auth = await requireOrganisationContext();",
      acceptIdx
    );
    expect(acceptIdx).toBeGreaterThan(-1);
    expect(orgContextIdx).toBeGreaterThan(acceptIdx);
    const acceptBlock = route.slice(acceptIdx, orgContextIdx);
    expect(acceptBlock).toContain("requireAuthenticatedUser");
    expect(acceptBlock).toContain("acceptOrganisationInvitation");
    expect(acceptBlock).not.toContain("requireOrganisationPermission");
    expect(acceptBlock).not.toContain("requireOrganisationContext");
  });

  it("maps RPC failure codes without leaking hashes", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code: "INVITATION_EMAIL_MISMATCH" },
      error: null,
    });

    await expect(
      acceptOrganisationInvitation({
        supabase: { rpc } as never,
        token: "tok",
        userId: "user-1",
        userEmail: "a@example.com",
      })
    ).rejects.toMatchObject({
      name: "InvitationAcceptError",
      code: "INVITATION_EMAIL_MISMATCH",
    });

    expect(rpc).toHaveBeenCalledWith("accept_organisation_invitation", {
      invitation_token: "tok",
    });
  });

  it("maps successful RPC payload to safe identifiers", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        organisation_id: "org-1",
        membership_id: "mem-1",
        role: "practitioner",
        professional_role: "coach",
      },
      error: null,
    });

    const result = await acceptOrganisationInvitation({
      supabase: { rpc } as never,
      token: "tok",
      userId: "user-1",
      userEmail: "invitee@example.com",
    });

    expect(result).toEqual({
      organisationId: "org-1",
      membershipId: "mem-1",
      role: "practitioner",
      professionalRole: "coach",
    });
  });

  it("rejects empty tokens before calling RPC", async () => {
    const rpc = vi.fn();
    await expect(
      acceptOrganisationInvitation({
        supabase: { rpc } as never,
        token: "   ",
        userId: "user-1",
        userEmail: "a@example.com",
      })
    ).rejects.toBeInstanceOf(InvitationAcceptError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("documents all required accept error codes", () => {
    expect(INVITATION_ACCEPT_ERROR_CODES).toEqual([
      "INVITATION_INVALID",
      "INVITATION_EXPIRED",
      "INVITATION_ALREADY_USED",
      "INVITATION_EMAIL_MISMATCH",
      "INVITATION_MEMBERSHIP_EXISTS",
    ]);
    for (const code of INVITATION_ACCEPT_ERROR_CODES) {
      expect(invitationAcceptErrorMessage(code).length).toBeGreaterThan(5);
      expect(invitationAcceptErrorMessage(code)).not.toMatch(/token_hash|service/i);
    }
  });

  it("token hashing remains one-way for storage", () => {
    const token = "example-invitation-token";
    const hash = hashInvitationToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
  });

  it("places repair migration after organisation foundation and licence", () => {
    const files = readdirSync(join(root, "supabase/migrations"))
      .filter(f => f.endsWith(".sql"))
      .sort();
    expect(files[0]).toBe("20260724150000_core_tables_bootstrap.sql");
    expect(files).toContain("20260802140000_organisation_foundation.sql");
    expect(files).toContain("20260802150000_organisation_licence.sql");
    expect(files).toContain("20260802210000_repair_invitation_acceptance.sql");
    expect(
      files.indexOf("20260802210000_repair_invitation_acceptance.sql")
    ).toBeGreaterThan(files.indexOf("20260802150000_organisation_licence.sql"));
  });
});
