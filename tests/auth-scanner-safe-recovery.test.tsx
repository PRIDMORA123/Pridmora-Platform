/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const verifyOtp = vi.fn();
const getUser = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const onAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      verifyOtp,
      getUser,
      updateUser,
      signOut,
      onAuthStateChange,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

describe("scanner-safe password recovery UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    verifyOtp.mockReset();
    getUser.mockReset();
    updateUser.mockReset();
    signOut.mockReset();
    onAuthStateChange.mockClear();
    window.history.replaceState({}, "", "/auth/reset-password");
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderForm() {
    act(() => {
      root.render(<ResetPasswordForm />);
    });
  }

  it("does not call verifyOtp on GET/load when token_hash is present", async () => {
    window.history.replaceState(
      {},
      "",
      "/auth/reset-password?token_hash=test-hash-value&type=recovery"
    );

    await act(async () => {
      renderForm();
      await Promise.resolve();
    });

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Continue to reset password/i);
    expect(container.textContent).toMatch(/Confirm password reset/i);
  });

  it("calls verifyOtp only after Continue, then shows password form", async () => {
    window.history.replaceState(
      {},
      "",
      "/auth/reset-password?token_hash=test-hash-value&type=recovery"
    );
    verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });

    await act(async () => {
      renderForm();
      await Promise.resolve();
    });

    expect(verifyOtp).not.toHaveBeenCalled();

    const continueButton = Array.from(container.querySelectorAll("button")).find(
      button => /Continue to reset password/i.test(button.textContent || "")
    ) as HTMLButtonElement;

    await act(async () => {
      continueButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "test-hash-value",
      type: "recovery",
    });
    expect(container.textContent).toMatch(/Choose a new password/i);
    expect(container.querySelector('input[name="password"]')).toBeTruthy();
  });

  it("handles expired/invalid token after Continue without leaking the hash", async () => {
    window.history.replaceState(
      {},
      "",
      "/auth/reset-password?token_hash=burned-secret-hash&type=recovery"
    );
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: {
        message: "Email link is invalid or has expired",
        code: "otp_expired",
      },
    });

    await act(async () => {
      renderForm();
      await Promise.resolve();
    });

    const continueButton = Array.from(container.querySelectorAll("button")).find(
      button => /Continue to reset password/i.test(button.textContent || "")
    ) as HTMLButtonElement;

    await act(async () => {
      continueButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/no longer valid|expired/i);
    expect(container.textContent).not.toContain("burned-secret-hash");
    expect(container.querySelector('input[name="password"]')).toBeNull();
  });

  it("shows missing-token state when opened without recovery params or session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await act(async () => {
      renderForm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/missing a valid reset token|no longer valid/i);
  });
});

describe("scanner-safe recovery wiring", () => {
  const root = process.cwd();

  it("email template points at reset-password, not GET /auth/confirm", () => {
    const template = readFileSync(
      join(root, "supabase/email-templates/recovery.html"),
      "utf8"
    );
    expect(template).toContain(
      "{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery"
    );
    expect(template).not.toContain("/auth/confirm?token_hash=");
    expect(template).toMatch(/Continue to reset password/i);
  });

  it("reset-password form never auto-navigates recovery token_hash to /auth/confirm", () => {
    const source = readFileSync(
      join(root, "components/auth/reset-password-form.tsx"),
      "utf8"
    );
    expect(source).toContain('type: "recovery"');
    expect(source).toContain("verifyOtp");
    expect(source).toContain("Continue to reset password");
    expect(source).toContain("awaiting_continue");
    expect(source).not.toMatch(
      /tokenHash && type === "recovery"[\s\S]*\/auth\/confirm/
    );
    expect(source).not.toMatch(/window\.location\.replace\(confirm/);
  });

  it("invite confirm route still verifies on GET for non-recovery email flows", () => {
    const confirm = readFileSync(join(root, "app/auth/confirm/route.ts"), "utf8");
    expect(confirm).toContain("verifyOtp");
    expect(confirm).toContain("token_hash");
    const inviteTest = readFileSync(
      join(root, "tests/manager-invite-auth.test.ts"),
      "utf8"
    );
    expect(inviteTest).toContain("/auth/confirm");
    expect(inviteTest).toContain('type=invite');
  });
});
