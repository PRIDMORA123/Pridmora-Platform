"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { isPlatformOwner } from "@/lib/owner/platform-owner";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Workspace account nav entry back to Owner Console.
 * Visible only to active platform owners (shared isPlatformOwner check).
 */
export function OwnerConsoleNavLink({ onNavigate }: { onNavigate?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveVisibility() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id || cancelled) return;
        const allowed = await isPlatformOwner(supabase, user.id);
        if (!cancelled) setVisible(allowed);
      } catch {
        if (!cancelled) setVisible(false);
      }
    }

    void resolveVisibility();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <a
      href="/owner"
      className="identity-nav-link identity-sidebar-nav-item"
      onClick={() => onNavigate?.()}
    >
      <Shield size={18} aria-hidden /> Owner Console
    </a>
  );
}
