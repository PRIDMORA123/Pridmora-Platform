"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function OrganisationActionsMenu({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (items.length === 0) {
    return <span className="organisation-muted">—</span>;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="organisation-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) {
            const width = 200;
            setPosition({
              top: Math.min(rect.bottom + 6, window.innerHeight - 120),
              left: Math.min(
                Math.max(12, rect.right - width),
                window.innerWidth - width - 12
              ),
            });
          }
          setOpen(value => !value);
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="organisation-actions-menu"
              role="menu"
              style={{ top: position.top, left: position.left }}
            >
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={
                    item.danger
                      ? "organisation-actions-item is-danger"
                      : "organisation-actions-item"
                  }
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function OrganisationEmptyActions(): ReactNode {
  return <span className="organisation-muted">—</span>;
}
