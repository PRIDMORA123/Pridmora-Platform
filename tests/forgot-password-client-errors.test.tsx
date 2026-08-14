/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAuth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}));

const recovery = vi.hoisted(() => ({
  resolveAuthSiteOrigin: vi.fn((fallback?: string) => fallback || "/"),
  buildPasswordRecoveryRedirectTo: vi.fn(
    (origin: string) => `${origin.replace(/\/$/, "")}/auth/reset-password`
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: supabaseAuth,
  }),
}));

vi.mock("@/lib/auth/recovery", () => ({
  resolveAuthSiteOrigin: (fallback?: string) =>
    recovery.resolveAuthSiteOrigin(fallback),
  buildPasswordRecoveryRedirectTo: (origin: string) =>
    recovery.buildPasswordRecoveryRedirectTo(origin),
}));

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function renderView(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  mounted.push({ root, container });
  return container;
}

beforeEach(() => {
  supabaseAuth.resetPasswordForEmail.mockReset();
  recovery.resolveAuthSiteOrigin.mockReset();
  recovery.buildPasswordRecoveryRedirectTo.mockReset();
  recovery.resolveAuthSiteOrigin.mockImplementation(
    (fallback?: string) => fallback || "https://pilot.pridmora.com"
  );
  recovery.buildPasswordRecoveryRedirectTo.mockImplementation(
    (origin: string) => `${String(origin).replace(/\/$/, "")}/auth/reset-password`
  );
  vi.stubGlobal("location", {
    ...window.location,
    origin: "https://pilot.pridmora.com",
  });
});

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    entry.root.unmount();
    entry.container.remove();
  }
});

describe("Forgot password client error handling", () => {
  it("config/origin throw does not show Network error", async () => {
    recovery.resolveAuthSiteOrigin.mockImplementation(() => {
      throw new Error(
        "Production auth origin cannot be validated without PRIDMORA_ENV=pilot|identity (or matching Supabase project ref)."
      );
    });

    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector(
      'input[name="email"]'
    ) as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(supabaseAuth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Unable to start password reset because authentication is not configured correctly"
    );
    expect(container.textContent).not.toContain("Network error");
  });

  it("real network exception still maps to Network error", async () => {
    recovery.resolveAuthSiteOrigin.mockImplementation(() => {
      throw new TypeError("Failed to fetch");
    });

    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector(
      'input[name="email"]'
    ) as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Network error. Please check your connection and try again."
    );
  });

  it("happy path calls resetPasswordForEmail with Pilot recovery URL", async () => {
    supabaseAuth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: null,
    });

    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector(
      'input[name="email"]'
    ) as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(supabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      "coach@example.com",
      {
        redirectTo: "https://pilot.pridmora.com/auth/reset-password",
      }
    );
    expect(container.textContent).toContain(
      "If an account exists for that email, you will receive a password reset link shortly."
    );
  });

  it("rate-limit Auth errors remain specifically mapped", async () => {
    supabaseAuth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: {
        name: "AuthApiError",
        message: "email rate limit exceeded",
        code: "over_email_send_rate_limit",
      },
    });

    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector(
      'input[name="email"]'
    ) as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Too many reset requests. Please wait a moment and try again."
    );
    expect(container.textContent).not.toContain("Network error");
  });
});
