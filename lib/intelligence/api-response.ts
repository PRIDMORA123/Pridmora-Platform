import { NextResponse } from "next/server";
import {
  IntelligenceMigrationRequiredError,
  isMissingIntelligenceSchema,
  toIntelligenceUserError,
} from "@/lib/intelligence/errors";

export function intelligenceErrorResponse(
  error: unknown,
  fallback: string
): NextResponse {
  if (
    error instanceof IntelligenceMigrationRequiredError ||
    isMissingIntelligenceSchema(error)
  ) {
    return NextResponse.json(
      {
        error: new IntelligenceMigrationRequiredError().message,
        code: "INTELLIGENCE_MIGRATION_REQUIRED",
        recoverable: true,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { error: toIntelligenceUserError(error, fallback), recoverable: true },
    { status: 500 }
  );
}
