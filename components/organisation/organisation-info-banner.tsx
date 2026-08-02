export function OrganisationInfoBanner({ children }: { children: string }) {
  return (
    <aside className="organisation-info-banner" role="note">
      <p>{children}</p>
    </aside>
  );
}
