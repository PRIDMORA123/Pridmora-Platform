import { BRAND } from "@/lib/brand";

/**
 * Authenticated product wordmark.
 * Legacy internal component name retained for compatibility.
 * Visible product brand: Pridmora Development Platform.
 */
export function IdentityProductMark({
  variant = "short",
}: {
  /** short = sidebar/header two-line mark; full = complete product name */
  variant?: "short" | "full";
} = {}) {
  if (variant === "full") {
    return (
      <div className="product-brand product-brand--full" aria-label={BRAND.productName}>
        <span className="product-brand__name" aria-hidden="true">
          {BRAND.productName}
        </span>
      </div>
    );
  }

  return (
    <div className="product-brand" aria-label={BRAND.productName}>
      <span className="product-brand__company" aria-hidden="true">
        {BRAND.companyName}
      </span>
      <span className="product-brand__name" aria-hidden="true">
        {BRAND.productShortName}
      </span>
    </div>
  );
}

/** Alias for clearer naming without a destructive rename. */
export { IdentityProductMark as PridmoraProductMark };
