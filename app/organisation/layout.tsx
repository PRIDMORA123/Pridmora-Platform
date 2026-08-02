import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";

export default async function OrganisationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    redirect("/auth/sign-in?next=/organisation");
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
