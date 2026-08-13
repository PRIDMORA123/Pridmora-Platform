import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { ORGANISATION_INVITATION_ACCEPT_PATH } from "@/lib/organisations/invitation-accept-auth";

function isInvitationAcceptPath(pathname: string): boolean {
  return (
    pathname === ORGANISATION_INVITATION_ACCEPT_PATH ||
    pathname.startsWith(`${ORGANISATION_INVITATION_ACCEPT_PATH}/`)
  );
}

export default async function OrganisationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "";

  // Invitation acceptance must render without requiring an existing cookie
  // session so email-link hash tokens can be consumed in the browser.
  // Auth + email ownership remain enforced by the accept API.
  if (!isInvitationAcceptPath(pathname)) {
    const user = await getSessionUser().catch(() => null);
    if (!user) {
      redirect("/auth/sign-in?next=/organisation");
    }
  }

  return (
    <div className="organisation-layout identity-app-surface">
      <Suspense
        fallback={<p className="organisation-muted">Loading workspace…</p>}
      >
        {children}
      </Suspense>
    </div>
  );
}
