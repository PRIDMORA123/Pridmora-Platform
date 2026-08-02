"use client";

import type { ReactNode } from "react";

export type PreparationBriefSectionProps = {
  title: string;
  children: ReactNode;
  as?: "section" | "div";
};

export function PreparationBriefSection({
  title,
  children,
  as: Tag = "section",
}: PreparationBriefSectionProps) {
  return (
    <Tag className="preparation-brief__section">
      <h2>{title}</h2>
      {children}
    </Tag>
  );
}
