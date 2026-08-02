import { NextResponse } from "next/server";
import {
  DevelopmentUpdateMigrationRequiredError,
  isMissingDevelopmentUpdateSchema,
  toDevelopmentUpdateUserError,
} from "@/lib/development-updates/errors";

export function developmentUpdateErrorResponse(
  error: unknown,
  fallback: string
): NextResponse {
  if (
    error instanceof DevelopmentUpdateMigrationRequiredError ||
    isMissingDevelopmentUpdateSchema(error)
  ) {
    return NextResponse.json(
      {
        error: new DevelopmentUpdateMigrationRequiredError().message,
        code: "DEVELOPMENT_UPDATE_MIGRATION_REQUIRED",
        recoverable: true,
      },
      { status: 503 }
    );
  }

  const message = toDevelopmentUpdateUserError(error, fallback);
  const alreadyApplied = /already been applied/i.test(message);

  return NextResponse.json(
    { error: message, recoverable: true },
    { status: alreadyApplied ? 409 : 500 }
  );
}
