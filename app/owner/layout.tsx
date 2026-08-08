import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";
import { isPlatformOwner } from "@/lib/owner/auth";
import "../owner-console.css";

/**
 * Owner Console shell — separate from Manager Command Centre (`/`) and
 * organisation workspace (`/organisation`).
 *
 * Authorisation uses platform_owners only. Organisation Manager membership
 * neither grants nor revokes Owner Console access.
 */
export default async function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    redirect("/auth/sign-in?next=/owner");
  }

  const supabase = await createAuthenticatedServerClient();
  // platform_owner check is independent of organisation membership / Manager role.
  const allowed = await isPlatformOwner(supabase, user.id);

  if (!allowed) {
    // Stay on /owner with an access-denied surface. Never redirect managers to `/`.
    return (
      <div className="owner-layout">
        <div className="owner-denied" role="alert">
          <div>
            <h1>Access denied</h1>
            <p className="owner-muted">
              The Pridmora Owner Console is available only to authorised platform
              owners.
            </p>
            <p style={{ marginTop: "1rem" }}>
              <a className="owner-button owner-button--secondary" href="/">
                Return to workspace
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="owner-layout">
      <Suspense fallback={<p className="owner-muted" style={{ padding: "1.5rem" }}>Loading Owner Console…</p>}>
        {children}
      </Suspense>
    </div>
  );
}
