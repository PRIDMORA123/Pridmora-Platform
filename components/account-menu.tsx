"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, LogOut, Settings, Shield } from "lucide-react";
import { isPlatformOwner } from "@/lib/owner/platform-owner";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AccountMenuProps = {
  coachName: string;
  coachTitle: string;
  coachInitials: string;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onNavigateAway?: () => void;
  /** Sidebar menus open upward; header menus open downward. */
  menuPlacement?: "above" | "below";
};

/**
 * Sidebar account control: avatar/name/chevron opens a small menu.
 * Menu is portalled — sidebar uses overflow:hidden which would clip in-flow menus.
 */
export function AccountMenu({
  coachName,
  coachTitle,
  coachInitials,
  onOpenSettings,
  onSignOut,
  onNavigateAway,
  menuPlacement = "above",
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [showOwnerConsole, setShowOwnerConsole] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveOwnerVisibility() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id || cancelled) return;
        const allowed = await isPlatformOwner(supabase, user.id);
        if (!cancelled) setShowOwnerConsole(allowed);
      } catch {
        if (!cancelled) setShowOwnerConsole(false);
      }
    }

    void resolveOwnerVisibility();
    return () => {
      cancelled = true;
    };
  }, []);

  function placeMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 220);
    const estimatedHeight = showOwnerConsole ? 160 : 120;
    const top =
      menuPlacement === "below"
        ? Math.min(
            rect.bottom + 8,
            Math.max(12, window.innerHeight - estimatedHeight - 12)
          )
        : Math.max(12, rect.top - estimatedHeight - 8);
    const left = Math.min(
      Math.max(12, rect.left),
      window.innerWidth - width - 12
    );
    setPosition({ top, left, width });
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onReposition() {
      placeMenu();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, showOwnerConsole, menuPlacement]);

  useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]'
    );
    firstItem?.focus();
  }, [open]);

  function closeAnd(action: () => void) {
    setOpen(false);
    onNavigateAway?.();
    action();
  }

  function toggleOpen() {
    if (!open) placeMenu();
    setOpen(value => !value);
  }

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="identity-account-menu__panel"
            role="menu"
            aria-label="Account"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="identity-account-menu__item"
              onClick={() => closeAnd(onOpenSettings)}
            >
              <Settings size={16} aria-hidden="true" />
              Profile / Settings
            </button>
            {showOwnerConsole ? (
              <a
                href="/owner"
                role="menuitem"
                className="identity-account-menu__item"
                onClick={() => {
                  setOpen(false);
                  onNavigateAway?.();
                }}
              >
                <Shield size={16} aria-hidden="true" />
                Owner Console
              </a>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="identity-account-menu__item is-danger"
              onClick={() => closeAnd(onSignOut)}
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="identity-account-menu">
      <button
        ref={triggerRef}
        type="button"
        className="identity-account-menu__trigger"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggleOpen}
      >
        <span className="identity-sidebar-avatar" aria-hidden="true">
          {coachInitials}
        </span>
        <span className="identity-account-menu__identity">
          <strong className="identity-sidebar-account-name">{coachName}</strong>
          <small className="identity-sidebar-account-role">{coachTitle}</small>
        </span>
        <ChevronUp
          size={16}
          aria-hidden="true"
          className={
            open
              ? "identity-account-menu__chevron is-open"
              : "identity-account-menu__chevron"
          }
        />
      </button>
      {menu}
    </div>
  );
}
