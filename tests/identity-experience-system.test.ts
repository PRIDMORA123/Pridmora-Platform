import { describe, expect, it } from "vitest";
import {
  EVIDENCE_STRENGTH_LABELS,
  REVIEW_STATE_LABELS,
} from "@/components/identity-intelligence/types";

describe("Identity Experience System tokens and intelligence taxonomy", () => {
  it("exposes Emerging, Supported and Established evidence labels", () => {
    expect(EVIDENCE_STRENGTH_LABELS.emerging).toBe("Emerging");
    expect(EVIDENCE_STRENGTH_LABELS.supported).toBe("Supported");
    expect(EVIDENCE_STRENGTH_LABELS.established).toBe("Established");
  });

  it("exposes Draft, Reviewed, Accepted and Rejected review states", () => {
    expect(REVIEW_STATE_LABELS.draft).toBe("Draft");
    expect(REVIEW_STATE_LABELS.reviewed).toBe("Reviewed");
    expect(REVIEW_STATE_LABELS.accepted).toBe("Accepted");
    expect(REVIEW_STATE_LABELS.rejected).toBe("Rejected");
  });
});
