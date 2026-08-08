"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PASSWORD_RESET_PATH } from "@/lib/auth/recovery";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Safety net for password recovery links that land on `/` (Site URL) or
 * another non-reset route with a recovery session / hash / code.
 * Does not grant access — only forwards an existing recovery auth state to
 * `/auth/reset-password`.
 */
export function RecoverySessionBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (
      pathname === PASSWORD_RESET_PATH ||
      pathname?.startsWith("/auth/callback") ||
      pathname?.startsWith("/auth/confirm")
    ) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function handoffRecovery() {
      try {
        const search = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash
        );
        const type = search.get("type") || hashParams.get("type");
        const code = search.get("code");

        if (code && type === "recovery") {
          const callback = new URL("/auth/callback", window.location.origin);
          callback.searchParams.set("code", code);
          callback.searchParams.set("next", PASSWORD_RESET_PATH);
          callback.searchParams.set("type", "recovery");
          window.location.replace(callback.toString());
          return;
        }

        const supabase = createBrowserSupabaseClient();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(event => {
          if (cancelled) return;
          if (event === "PASSWORD_RECOVERY") {
            router.replace(PASSWORD_RESET_PATH);
          }
        });
        unsubscribe = () => subscription.unsubscribe();

        if (type === "recovery") {
          const { data } = await supabase.auth.getSession();
          if (!cancelled && data.session) {
            router.replace(PASSWORD_RESET_PATH);
          }
        }
      } catch {
        // Auth not configured or bridge unavailable — leave routing unchanged.
      }
    }

    void handoffRecovery();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [pathname, router]);

  return null;
}
