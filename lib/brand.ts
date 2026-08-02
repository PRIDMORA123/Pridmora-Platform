/**
 * Canonical visible product brand.
 * Internal namespaces (identity-*, IdentityButton, API routes, DB) remain for compatibility.
 * Visible product brand: Pridmora Development Platform.
 */
export const BRAND = {
  companyName: "Pridmora",
  legalCompanyName: "Pridmora Ltd",

  productName: "Pridmora Development Platform",

  productShortName: "Development Platform",

  productDescriptor:
    "Development intelligence for better conversations",

  intelligenceName: "Pridmora Intelligence",

  /** Visible journey feature name (replaces Professional Identity Journey™ in UI). */
  journeyName: "Development Journey",

  /** Visible report product label. */
  reportName: "Development Report",
} as const;

export function getProductTitle(pageTitle?: string): string {
  return pageTitle
    ? `${pageTitle} | ${BRAND.productName}`
    : BRAND.productName;
}

/** Metadata helpers for Next.js layout / pages. */
export const brandMetadata = {
  title: {
    default: BRAND.productName,
    template: `%s | ${BRAND.productName}`,
  },
  description: `${BRAND.productDescriptor}.`,
  applicationName: BRAND.productName,
  openGraph: {
    title: BRAND.productName,
    description: `${BRAND.productDescriptor}.`,
    siteName: BRAND.productName,
  },
  twitter: {
    title: BRAND.productName,
    description: `${BRAND.productDescriptor}.`,
  },
} as const;
