import { redirect } from "next/navigation";
import { SampleOrganisationPage } from "@/components/sample-organisation/sample-organisation-page";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { canManageSampleOrganisation } from "@/lib/organisations/permissions";

export default async function SettingsSampleOrganisationRoute() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) {
    redirect("/auth/sign-in?next=/settings/sample-organisation");
  }
  if (!canManageSampleOrganisation(auth.context.organisation.role)) {
    redirect("/");
  }

  return <SampleOrganisationPage />;
}
