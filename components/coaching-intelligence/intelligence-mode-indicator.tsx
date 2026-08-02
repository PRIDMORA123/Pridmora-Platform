"use client";

import { useRef, useState } from "react";
import { IntelligenceModeChip } from "@/components/coaching-intelligence/intelligence-mode-chip";
import { IntelligenceDetailsDrawer } from "@/components/coaching-intelligence/intelligence-details-drawer";
import type {
  CoachingIntelligenceMode,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

export function IntelligenceModeIndicator({
  mode,
  usedSources = [],
  lastRefreshedAt = null,
}: {
  mode: CoachingIntelligenceMode;
  usedSources?: IntelligenceSource[];
  lastRefreshedAt?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IntelligenceModeChip
        ref={triggerRef}
        mode={mode}
        onClick={() => setOpen(true)}
      />

      <IntelligenceDetailsDrawer
        isOpen={open}
        mode={mode}
        usedSources={usedSources}
        lastRefreshedAt={lastRefreshedAt}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      />
    </>
  );
}
