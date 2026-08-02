import { HomeApp } from "@/components/home-app";
import { MarketingHomepage } from "@/components/marketing-homepage";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Public marketing homepage for visitors.
 * Authenticated users enter the development workspace.
 */
export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);

  if (!user) {
    return <MarketingHomepage />;
  }

  return <HomeApp />;
}
