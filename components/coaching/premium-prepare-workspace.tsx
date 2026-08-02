"use client";

/**
 * Compatibility shim — Prepare canvas now lives in PreparationView.
 * Kept so existing imports continue to resolve during consolidation.
 */
export {
  PreparationView as PremiumPrepareWorkspace,
  type PreparationViewProps as PremiumPrepareWorkspaceProps,
} from "@/components/prepare/preparation-view";
