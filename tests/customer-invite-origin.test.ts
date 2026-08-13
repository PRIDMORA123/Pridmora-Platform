import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPublicCustomerInviteOrigin,
  CUSTOMER_INVITE_ORIGIN_ENV,
  CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE,
  resolveCustomerInviteOrigin,
} from "@/lib/owner/customer-invite-origin";
import {
  buildOrganisationInviteRedirectTo,
  inviteOrganisationLead,
  inviteOrganisationManager,
} from "@/lib/owner/invite-organisation-member";
import {
  IDENTITY_PRODUCTION_ORIGIN,
  PILOT_PRODUCTION_ORIGIN,
} from "@/lib/supabase/project-env";

describe("Customer invite origin policy", () => {
  const original = {
    customer: process.env.CUSTOMER_INVITE_ORIGIN,
    site: process.env.NEXT_PUBLIC_SITE_URL,
    app: process.env.APP_URL,
    envName: process.env.PRIDMORA_ENV,
    nodeEnv: process.env.NODE_ENV,
  };

  afterEach(() => {
    for (const [key, value] of [
      [CUSTOMER_INVITE_ORIGIN_ENV, original.customer],
      ["NEXT_PUBLIC_SITE_URL", original.site],
      ["APP_URL", original.app],
      ["PRIDMORA_ENV", original.envName],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (original.nodeEnv === undefined) {
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("NODE_ENV", original.nodeEnv);
    }
    vi.restoreAllMocks();
  });

  it("rejects loopback invite origin", () => {
    process.env.PRIDMORA_ENV = "pilot";
    expect(
      assertPublicCustomerInviteOrigin("http://127.0.0.1:3001").ok
    ).toBe(false);
    expect(
      assertPublicCustomerInviteOrigin("https://127.0.0.1:3001").ok
    ).toBe(false);
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3001";
    delete process.env.CUSTOMER_INVITE_ORIGIN;
    delete process.env.APP_URL;
    expect(resolveCustomerInviteOrigin().ok).toBe(false);
  });

  it("rejects localhost invite origin", () => {
    expect(
      assertPublicCustomerInviteOrigin("http://localhost:3001").ok
    ).toBe(false);
    expect(assertPublicCustomerInviteOrigin("https://localhost").ok).toBe(
      false
    );
  });

  it("rejects private LAN origin", () => {
    expect(
      assertPublicCustomerInviteOrigin("http://192.168.1.10:3001").ok
    ).toBe(false);
    expect(assertPublicCustomerInviteOrigin("https://10.0.0.5").ok).toBe(
      false
    );
    expect(assertPublicCustomerInviteOrigin("https://172.16.4.2").ok).toBe(
      false
    );
    expect(assertPublicCustomerInviteOrigin("https://app.local").ok).toBe(
      false
    );
  });

  it("CUSTOMER_INVITE_ORIGIN Pilot public URL is accepted", () => {
    process.env.PRIDMORA_ENV = "pilot";
    const result = assertPublicCustomerInviteOrigin(PILOT_PRODUCTION_ORIGIN);
    expect(result).toEqual({
      ok: true,
      origin: PILOT_PRODUCTION_ORIGIN,
    });
  });

  it("rejects platform.pridmora.com when PRIDMORA_ENV=pilot", () => {
    process.env.PRIDMORA_ENV = "pilot";
    expect(
      assertPublicCustomerInviteOrigin(IDENTITY_PRODUCTION_ORIGIN).ok
    ).toBe(false);
    process.env.CUSTOMER_INVITE_ORIGIN = IDENTITY_PRODUCTION_ORIGIN;
    expect(resolveCustomerInviteOrigin().ok).toBe(false);
  });

  it("rejects pilot.pridmora.com when PRIDMORA_ENV=identity", () => {
    process.env.PRIDMORA_ENV = "identity";
    expect(assertPublicCustomerInviteOrigin(PILOT_PRODUCTION_ORIGIN).ok).toBe(
      false
    );
    expect(
      assertPublicCustomerInviteOrigin(IDENTITY_PRODUCTION_ORIGIN).ok
    ).toBe(true);
  });

  it("rejects loopback invite origin in production Pilot", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.PRIDMORA_ENV = "pilot";
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3001";
    delete process.env.CUSTOMER_INVITE_ORIGIN;
    expect(resolveCustomerInviteOrigin().ok).toBe(false);
  });

  it("Lead invite public URL uses pilot.pridmora.com", () => {
    process.env.PRIDMORA_ENV = "pilot";
    process.env.CUSTOMER_INVITE_ORIGIN = PILOT_PRODUCTION_ORIGIN;
    const origin = resolveCustomerInviteOrigin();
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(
      buildOrganisationInviteRedirectTo(origin.origin, "lead-token-1")
    ).toBe(
      `${PILOT_PRODUCTION_ORIGIN}/organisation/invitations/accept?token=lead-token-1`
    );
  });

  it("Manager invite public URL uses pilot.pridmora.com", () => {
    process.env.PRIDMORA_ENV = "pilot";
    process.env.CUSTOMER_INVITE_ORIGIN = PILOT_PRODUCTION_ORIGIN;
    const origin = resolveCustomerInviteOrigin();
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(
      buildOrganisationInviteRedirectTo(origin.origin, "mgr-token-2")
    ).toBe(
      `${PILOT_PRODUCTION_ORIGIN}/organisation/invitations/accept?token=mgr-token-2`
    );
  });

  it("does not silently use loopback NEXT_PUBLIC_SITE_URL when CUSTOMER_INVITE_ORIGIN is unset", () => {
    process.env.PRIDMORA_ENV = "pilot";
    delete process.env.CUSTOMER_INVITE_ORIGIN;
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3001";
    process.env.APP_URL = "http://127.0.0.1:3001";
    const result = resolveCustomerInviteOrigin();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE);
    }
  });

  it("triggers no Auth email when public invite origin is invalid", async () => {
    process.env.PRIDMORA_ENV = "pilot";
    delete process.env.CUSTOMER_INVITE_ORIGIN;
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3001";

    const inviteUserByEmail = vi.fn();
    const signInWithOtp = vi.fn();
    const insert = vi.fn();
    const update = vi.fn();

    const from = vi.fn((table: string) => {
      if (table === "organisations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "org-1", name: "Acme", status: "active" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        update: (...args: unknown[]) => {
          update(...args);
          return {
            eq: () => ({
              eq: () => ({
                ilike: async () => ({ error: null }),
              }),
            }),
          };
        },
        insert: (...args: unknown[]) => {
          insert(...args);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "inv-1" },
                error: null,
              }),
            }),
          };
        },
      };
    });

    const supabase = { from } as never;
    const service = {
      from,
      auth: {
        admin: { inviteUserByEmail },
        signInWithOtp,
      },
    } as never;

    await expect(
      inviteOrganisationLead({
        supabase,
        service,
        organisationId: "org-1",
        invitedBy: "owner-1",
        requestOrigin: "http://127.0.0.1:3001",
        payload: {
          fullName: "Lead Person",
          email: "lead@example.com",
          jobTitle: "Lead",
        },
      })
    ).rejects.toThrow(CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE);

    await expect(
      inviteOrganisationManager({
        supabase,
        service,
        organisationId: "org-1",
        invitedBy: "owner-1",
        requestOrigin: "http://127.0.0.1:3001",
        payload: {
          fullName: "Manager Person",
          email: "manager@example.com",
          jobTitle: "Manager",
        },
      })
    ).rejects.toThrow(CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE);

    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
