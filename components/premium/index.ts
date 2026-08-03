/**
 * Premium Experience System — shared component aliases.
 *
 * These map onto the existing Identity Experience primitives so authenticated
 * surfaces can use a consistent Premium* vocabulary without duplicating UI.
 */
export { IdentityPageHeader as PremiumPageHeader } from "@/components/identity/page-header";
export type { IdentityPageHeaderProps as PremiumPageHeaderProps } from "@/components/identity/page-header";

export { IdentitySection as PremiumSection } from "@/components/identity/section";

export { IdentityPanel as PremiumPanel } from "@/components/identity/panel";

export { IdentityButton as PremiumButton } from "@/components/identity/button";

export { IdentityEmptyState as PremiumEmptyState } from "@/components/identity/empty-state";

export { IdentityStatus as PremiumStatus } from "@/components/identity/status";

export {
  PremiumInput,
  PremiumFieldGroup,
  type PremiumInputProps,
  type PremiumTextareaProps,
} from "@/components/premium/premium-input";

export {
  PremiumInlineNotice,
  type PremiumInlineNoticeTone,
} from "@/components/premium/premium-inline-notice";

export { PremiumLoadingState } from "@/components/premium/premium-loading-state";
