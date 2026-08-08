/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { AuthPasswordField } from "@/components/auth/auth-fields";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const supabaseAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

const platformOwner = vi.hoisted(() => ({
  isPlatformOwner: vi.fn(),
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: navigation.replace,
    refresh: navigation.refresh,
    push: navigation.push,
  }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: supabaseAuth,
  }),
}));

vi.mock("@/lib/owner/platform-owner", () => ({
  isPlatformOwner: platformOwner.isPlatformOwner,
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
  navigation.replace.mockReset();
  navigation.refresh.mockReset();
  navigation.push.mockReset();
  navigation.searchParams = new URLSearchParams();
  supabaseAuth.signInWithPassword.mockReset();
  supabaseAuth.signUp.mockReset();
  supabaseAuth.resetPasswordForEmail.mockReset();
  supabaseAuth.updateUser.mockReset();
  supabaseAuth.getSession.mockReset();
  supabaseAuth.getUser.mockReset();
  supabaseAuth.signOut.mockReset();
  supabaseAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  supabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  supabaseAuth.signOut.mockResolvedValue({ error: null });
  supabaseAuth.onAuthStateChange.mockReset();
  supabaseAuth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  platformOwner.isPlatformOwner.mockReset();
  platformOwner.isPlatformOwner.mockResolvedValue(false);
  window.localStorage.clear();
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

describe("auth layout replacement", () => {
  it("renders AuthBrandPanel with approved editorial copy and no motif", async () => {
    const container = await renderView(<AuthBrandPanel />);
    expect(container.textContent).toContain(BRAND.companyName);
    expect(container.textContent).toContain(BRAND.productShortName);
    expect(container.textContent).toContain("Development intelligence");
    expect(container.textContent).toContain("that transforms professional");
    expect(container.textContent).toContain("conversations");
    expect(container.textContent).toContain("into evidence.");
    expect(container.textContent).toContain("Capture what matters.");
    expect(container.textContent).toContain("Reveal meaningful patterns.");
    expect(container.textContent).toContain("Support confident professional judgement.");
    expect(container.textContent).toContain("Evidence before certainty.");
    expect(container.textContent).toContain("AI supports.");
    expect(container.textContent).toContain("Professional judgement decides.");
    expect(container.querySelector(".auth-brand")).toBeTruthy();
    expect(container.querySelector(".auth-brand__philosophy-lead")).toBeTruthy();
    expect(container.querySelectorAll(".auth-brand__support-item")).toHaveLength(3);
    expect(container.querySelectorAll(".auth-brand__support-marker")).toHaveLength(3);
    expect(container.querySelector(".auth-brand__support-icon")).toBeNull();
    expect(container.querySelector(".auth-evidence-path")).toBeNull();
    expect(container.querySelector(".login-card")).toBeNull();
    expect(container.textContent).not.toMatch(/\bCONVERSATION\b/);
    expect(container.textContent).not.toMatch(/\bEVIDENCE\b/);
    expect(container.textContent).not.toMatch(/\bINTELLIGENCE\b/);
  });

  it("AuthShell uses 45/55 auth-layout without a card or motif", async () => {
    const container = await renderView(
      <AuthShell eyebrow="WELCOME BACK" title="Welcome back" description="Continue building better conversations.">
        <form />
      </AuthShell>
    );
    expect(container.querySelector(".auth-layout")).toBeTruthy();
    expect(container.querySelector(".auth-brand")).toBeTruthy();
    expect(container.querySelector(".auth-form-panel")).toBeTruthy();
    expect(container.querySelector(".login-card")).toBeNull();
    expect(container.querySelector(".auth-evidence-path")).toBeNull();
    expect(container.querySelector(".auth-brand__hero-accent")?.textContent).toBe("into evidence.");
  });

  it("password field toggles visibility", async () => {
    const container = await renderView(
      <AuthPasswordField label="Password" name="password" autoComplete="current-password" />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const toggle = container.querySelector(".auth-field__toggle") as HTMLButtonElement;
    expect(input.type).toBe("password");
    await act(async () => {
      toggle.click();
    });
    expect(input.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      toggle.click();
    });
    expect(input.type).toBe("password");
  });

  it("sign-in shows approved copy, remember me, and loading state", async () => {
    supabaseAuth.signInWithPassword.mockImplementation(
      () => new Promise(() => undefined)
    );
    const { SignInForm } = await import("@/components/auth/sign-in-form");
    const container = await renderView(<SignInForm />);

    expect(container.textContent).toContain("WELCOME BACK");
    expect(container.textContent).toContain("Welcome back");
    expect(container.textContent).toContain("Continue building better conversations.");
    expect(container.textContent).toContain("Sign in securely to return to your workspace.");
    expect(container.textContent).toContain("Remember me");
    expect(container.textContent).toContain("Forgot your password?");
    expect(container.textContent).toContain("Create an account");
    expect(container.textContent).not.toContain("Privacy policy");
    expect(container.textContent).not.toContain("Terms of service");
    expect(container.querySelector(".auth-evidence-path")).toBeNull();

    const email = container.querySelector('input[name="email"]') as HTMLInputElement;
    const password = container.querySelector('input[name="password"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;
    email.value = "coach@example.com";
    password.value = "password123";

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({
      email: "coach@example.com",
      password: "password123",
    });
    expect(container.textContent).toContain("Signing in…");
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("sign-in prevents duplicate submission while pending", async () => {
    let resolveSignIn:
      | ((value: { data: { user: { id: string } }; error: null }) => void)
      | undefined;
    supabaseAuth.signInWithPassword.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSignIn = resolve;
        })
    );
    const { SignInForm } = await import("@/components/auth/sign-in-form");
    const container = await renderView(<SignInForm />);
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;
    const password = container.querySelector('input[name="password"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;
    email.value = "coach@example.com";
    password.value = "password123";

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("Signing in…");
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(supabaseAuth.signInWithPassword).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSignIn?.({ data: { user: { id: "coach-1" } }, error: null });
      await Promise.resolve();
    });
    expect(navigation.replace).toHaveBeenCalledWith("/");
  });

  it("sign-in sends platform owners to /owner after successful authentication", async () => {
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    platformOwner.isPlatformOwner.mockResolvedValue(true);
    const { SignInForm } = await import("@/components/auth/sign-in-form");
    const container = await renderView(<SignInForm />);
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;
    const password = container.querySelector('input[name="password"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      email.value = "owner@pridmora.com";
      password.value = "password123";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(platformOwner.isPlatformOwner).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith("/owner");
  });

  it("auth and marketing navigation links use the correct routes", async () => {
    const { SignInForm } = await import("@/components/auth/sign-in-form");
    const signIn = await renderView(<SignInForm />);
    expect(
      signIn.querySelector('a[href="/auth/sign-up"]')?.textContent
    ).toContain("Create an account");
    expect(
      signIn.querySelector('a[href="/auth/forgot-password"]')?.textContent
    ).toContain("Forgot your password?");

    const homepage = readFileSync(
      resolve(process.cwd(), "components/marketing-homepage.tsx"),
      "utf8"
    );
    expect(homepage).toContain('href="/auth/sign-in"');
    expect(homepage).toContain("Sign in");
    expect(homepage).toContain('href="/auth/sign-up"');
    expect(homepage).toContain("Start your free trial");
  });

  it("sign-up uses approved copy and Create account CTA", async () => {
    const { SignUpForm } = await import("@/components/auth/sign-up-form");
    const container = await renderView(<SignUpForm />);
    expect(container.textContent).toContain("GET STARTED");
    expect(container.textContent).toContain("Create your workspace.");
    expect(container.textContent).toContain(
      "Begin turning coaching conversations into meaningful development evidence."
    );
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain(
      "Create account"
    );
    expect(container.querySelector(".auth-evidence-path")).toBeNull();
  });

  it("forgot password uses approved recovery copy", async () => {
    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    expect(container.textContent).toContain("ACCOUNT RECOVERY");
    expect(container.textContent).toContain("Reset your password.");
    expect(container.textContent).toContain("secure reset link");
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain(
      "Send reset link"
    );
  });

  it("forgot password sends recovery redirectTo through auth callback to reset-password", async () => {
    supabaseAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(supabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      "coach@example.com",
      {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fauth%2Freset-password`,
      }
    );
    expect(container.textContent).toContain(
      "If an account exists for that email, you will receive a password reset link shortly."
    );
  });

  it("forgot password does not native-submit to sign-in and calls resetPasswordForEmail", async () => {
    supabaseAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;
    const submitButton = container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;

    // Native attributes must never target /auth/sign-in (405 source in production).
    expect(form.getAttribute("action") ?? "").not.toContain("/auth/sign-in");
    expect(submitButton.getAttribute("formAction") ?? "").not.toContain(
      "/auth/sign-in"
    );

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(supabaseAuth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(supabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      "coach@example.com",
      expect.objectContaining({
        redirectTo: expect.stringContaining("/auth/callback?next="),
      })
    );
  });

  it("forgot password surfaces rate-limit failures without success confirmation", async () => {
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
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Too many reset requests. Please wait a moment and try again."
    );
    expect(container.textContent).not.toContain(
      "If an account exists for that email, you will receive a password reset link shortly."
    );
    expect(container.textContent).not.toContain("email rate limit exceeded");
  });

  it("forgot password surfaces other auth failures without leaking provider details", async () => {
    supabaseAuth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: {
        name: "AuthApiError",
        message: "Redirect URL is not allowed",
        code: "validation_failed",
      },
    });
    const { ForgotPasswordForm } = await import(
      "@/components/auth/forgot-password-form"
    );
    const container = await renderView(<ForgotPasswordForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    const email = container.querySelector('input[name="email"]') as HTMLInputElement;

    await act(async () => {
      email.value = "coach@example.com";
      form.requestSubmit();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Unable to send a reset link right now. Please try again shortly."
    );
    expect(container.textContent).not.toContain("Redirect URL is not allowed");
    expect(container.textContent).not.toContain(
      "If an account exists for that email, you will receive a password reset link shortly."
    );
  });

  it("reset password requires a session and redirects to sign-in after update", async () => {
    supabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "coach-1" } },
      error: null,
    });
    supabaseAuth.updateUser.mockResolvedValue({ data: { user: { id: "coach-1" } }, error: null });

    const { ResetPasswordForm } = await import(
      "@/components/auth/reset-password-form"
    );
    const container = await renderView(<ResetPasswordForm />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("CREATE A NEW PASSWORD");
    expect(container.textContent).toContain("Choose a new password.");

    const password = container.querySelector('input[name="password"]') as HTMLInputElement;
    const confirm = container.querySelector(
      'input[name="confirm_password"]'
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      password.value = "new-password-1";
      confirm.value = "new-password-1";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    expect(supabaseAuth.signOut).toHaveBeenCalled();
    expect(container.textContent).toContain("Taking you to sign in");

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1300));
    });
    expect(navigation.replace).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("reset password shows expired state without a recovery session", async () => {
    supabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { ResetPasswordForm } = await import(
      "@/components/auth/reset-password-form"
    );
    const container = await renderView(<ResetPasswordForm />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("This link is no longer valid");
    expect(container.querySelector('a[href="/auth/forgot-password"]')).toBeTruthy();
  });

  it("check email panel uses verification copy", async () => {
    navigation.searchParams = new URLSearchParams("email=coach@example.com");
    const { CheckEmailPanel } = await import("@/components/auth/check-email-panel");
    const container = await renderView(<CheckEmailPanel />);
    expect(container.textContent).toContain("CHECK YOUR EMAIL");
    expect(container.textContent).toContain("Verify your account.");
    expect(container.textContent).toContain("coach@example.com");
  });

  it("exposes desktop and mobile structure classes without motif", async () => {
    const container = await renderView(
      <AuthShell eyebrow="WELCOME BACK" title="Welcome back">
        <form />
      </AuthShell>
    );
    expect(container.querySelector(".auth-layout")).toBeTruthy();
    expect(container.querySelector(".auth-brand")).toBeTruthy();
    expect(container.querySelector(".auth-brand__body")).toBeTruthy();
    expect(container.querySelector(".auth-brand__copy")).toBeTruthy();
    expect(container.querySelector(".auth-brand__philosophy")).toBeTruthy();
    expect(container.querySelector(".auth-form-panel")).toBeTruthy();
    expect(container.querySelector(".auth-evidence-path")).toBeNull();

    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain("grid-template-columns:minmax(0,45fr) minmax(0,55fr)");
    expect(css).toContain("@media (max-width:768px)");
    expect(css).not.toContain("auth-evidence-path");
    expect(css).not.toContain("auth-path-draw");
  });
});
