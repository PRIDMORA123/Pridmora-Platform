/**
 * Next.js server boot hook — auth environment fail-closed gate.
 * Never logs secrets/keys/tokens.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { assertAuthRuntimeConfigOrThrow } = await import(
    "@/lib/supabase/project-env"
  );

  try {
    const result = assertAuthRuntimeConfigOrThrow();
    if (process.env.NODE_ENV !== "production" && result.pinned) {
      console.info(
        JSON.stringify({
          source: "auth_runtime",
          outcome: "ok",
          environment: result.environment,
          projectRef: result.projectRef,
          origin: result.origin,
        })
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auth environment validation failed.";
    console.error(message);
    // Prevent a misconfigured process from serving auth traffic.
    throw error;
  }
}
