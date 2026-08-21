export { IdentityPathMark } from "@/components/identity/path-mark";
export { IdentityProductMark } from "@/components/identity/product-mark";
export { IdentitySectionMark } from "@/components/identity/section-mark";
export {
  IdentityPageShell,
  type IdentityPageShellProps,
  type IdentityPageShellWidth,
} from "@/components/identity/page-shell";
export { IdentityPageHeader } from "@/components/identity/page-header";
export { ClientIdentityHeader } from "@/components/identity/client-header";
export {
  IdentityJourneyPath,
  type JourneyStep,
} from "@/components/identity/journey-path";
export { IdentitySection } from "@/components/identity/section";
export { IdentityPanel } from "@/components/identity/panel";
export { IdentityButton } from "@/components/identity/button";
export { IdentityDrawer } from "@/components/identity/drawer";
export { IdentityStatus } from "@/components/identity/status";
export {
  DevelopmentStatusChip,
  DEVELOPMENT_STATUS_LABELS,
  type DevelopmentStatus,
  type DevelopmentStatusChipProps,
} from "@/components/identity/development-status-chip";
export {
  IdentityProcessingState,
  AURELIA_WORKING_TITLE,
  AURELIA_WORKING_DETAIL,
  AURELIA_WORKING_STAGES,
  type IdentityProcessingStep,
  type IdentityProcessingStateProps,
} from "@/components/identity/identity-processing-state";
export { IdentityEmptyState } from "@/components/identity/empty-state";
export { IdentityAsyncState } from "@/components/identity/async-state";
export { WelcomeWorkspace } from "@/components/identity/welcome-workspace";
export { OnboardingPrompt } from "@/components/identity/onboarding-prompt";
export { ProposedContentLabel } from "@/components/identity/proposed-label";
export { PriorityRelationshipRow } from "@/components/identity/priority-relationship-row";
export { ConversationWorkspaceRow } from "@/components/identity/conversation-workspace-row";
export { WorkspaceIntroduction } from "@/components/identity/workspace-introduction";
export { IdentityBackLink } from "@/components/identity/back-link";
export {
  PersonFlowBreadcrumb,
  PersonFlowBackLink,
} from "@/components/identity/person-flow-nav";
export { PremiumWorkspaceHeader } from "@/components/identity/premium-workspace-header";
export { NextBestAction, NextBestActionUpToDate } from "@/components/identity/next-best-action";
export { CoachingPracticeOverview } from "@/components/identity/coaching-practice-overview";
export { CoachingWorkItem } from "@/components/identity/coaching-work-item";
export { ConversationsInProgress } from "@/components/identity/conversations-in-progress";
export { RecentDevelopment } from "@/components/identity/recent-development";
export { RelationshipPortfolio } from "@/components/identity/relationship-portfolio";

// Premium Experience aliases (map onto Identity primitives — no duplicates)
export {
  PremiumPageHeader,
  PremiumSection,
  PremiumPanel,
  PremiumButton,
  PremiumInput,
  PremiumEmptyState,
  PremiumStatus,
  PremiumLoadingState,
  PremiumInlineNotice,
} from "@/components/premium";
