/**
 * Canonical visible product brand.
 * Internal namespaces (identity-*, IdentityButton, API routes, DB) remain for compatibility.
 * Visible product brand: Pridmora Development Platform — Manager Development & Intelligence.
 */
export const BRAND = {
  companyName: "Pridmora",
  legalCompanyName: "Pridmora Ltd",

  productName: "Pridmora Development Platform",

  productShortName: "Development Platform",

  productDescriptor:
    "Manager development and intelligence for organisations",

  /** Embedded Manager Development Intelligence Assistant (not a standalone chatbot). */
  intelligenceName: "Aurelia",

  intelligenceRole: "Manager Development Intelligence Assistant",

  /** Visible journey feature name (replaces Professional Identity Journey™ in UI). */
  journeyName: "Development Journey",

  /** Visible report product label. */
  reportName: "Development Report",

  /**
   * Public acquisition CTA for organisation-led pilots (no self-service sign-up).
   * WordPress contact form includes a "Request a demo" category.
   */
  requestDemoUrl: "https://pridmora.com/demo/",
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
