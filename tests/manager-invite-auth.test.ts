import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeNextPath } from "@/lib/auth/email-link";
import { resolveAuthCallbackNext } from "@/lib/auth/recovery";
import {
  buildManagerInviteAcceptNext,
  buildManagerInviteRedirectTo,
} from "@/lib/owner/invite-manager";

describe("Manager invite auth confirmation journey", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it("keeps the organisation invitation token through confirm → next", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://platform.pridmora.com";
    const orgToken = "org-invite-token-abc";
    const acceptNext = buildManagerInviteAcceptNext(orgToken);
    const redirectTo = buildManagerInviteRedirectTo(
      "https://platform.pridmora.com",
      orgToken
    );

    // Template builds: /auth/confirm?token_hash=…&type=invite&next=<urlencoded RedirectTo>
    const confirmUrl = new URL("https://platform.pridmora.com/auth/confirm");
    confirmUrl.searchParams.set("token_hash", "supabase-token-hash");
    confirmUrl.searchParams.set("type", "invite");
    confirmUrl.searchParams.set("next", redirectTo);

    expect(confirmUrl.searchParams.get("type")).toBe("invite");
    expect(confirmUrl.searchParams.get("token_hash")).toBeTruthy();
    expect(confirmUrl.search).not.toMatch(/(?:^|[?&])code=/);

    const nextAfterConfirm = resolveAuthCallbackNext({
      next: confirmUrl.searchParams.get("next"),
      type: confirmUrl.searchParams.get("type"),
    });
    expect(nextAfterConfirm).toBe(acceptNext);
    expect(nextAfterConfirm).toContain(`token=${orgToken}`);
  });

  it("does not depend on a PKCE code for Manager invites", () => {
    const lib = readFileSync(
      join(process.cwd(), "lib/owner/invite-manager.ts"),
      "utf8"
    );
    expect(lib).toContain("buildManagerInviteRedirectTo");
    expect(lib).toContain("buildManagerInviteAcceptNext");
    expect(lib).not.toContain("/auth/callback?next=");
    expect(
      buildManagerInviteRedirectTo("https://platform.pridmora.com", "t")
    ).not.toContain("/auth/callback");

    const confirm = readFileSync(
      join(process.cwd(), "app/auth/confirm/route.ts"),
      "utf8"
    );
    expect(confirm).toContain("verifyOtp");
    expect(confirm).toContain("token_hash");
    expect(confirm).toContain("redirect_to");
    expect(confirm).not.toContain("exchangeCodeForSession");
  });

  it("rejects unsafe external next / RedirectTo values", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://platform.pridmora.com";
    expect(sanitizeNextPath("https://evil.example/phish")).toBe("/");
    expect(sanitizeNextPath("//evil.example")).toBe("/");
    expect(
      resolveAuthCallbackNext({
        next: "https://evil.example/organisation/invitations/accept?token=x",
        type: "invite",
      })
    ).toBe("/");
    expect(
      resolveAuthCallbackNext({
        next: "https://platform.pridmora.com/organisation/invitations/accept?token=safe",
        type: "invite",
      })
    ).toBe("/organisation/invitations/accept?token=safe");
  });

  it("accepts invite type and relative accept next without recovery override", () => {
    const next = resolveAuthCallbackNext({
      next: "/organisation/invitations/accept?token=abc123",
      type: "invite",
    });
    expect(next).toBe("/organisation/invitations/accept?token=abc123");
    expect(next).not.toBe("/auth/reset-password");
  });
});
