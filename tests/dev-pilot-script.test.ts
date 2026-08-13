import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PILOT_PROJECT_REF } from "@/lib/supabase/project-env";

describe("dev:pilot canonical Pilot boot", () => {
  it("pins Pilot ref, 127.0.0.1:3001, and refuses localhost site URL", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/dev-pilot.mjs"),
      "utf8"
    );
    expect(script).toContain(PILOT_PROJECT_REF);
    expect(script).toContain("127.0.0.1");
    expect(script).toContain("-p");
    expect(script).toContain("3001");
    expect(script).toContain("PRIDMORA_ENV");
    expect(script).toContain("Refusing to start");
    expect(script).toContain("NEXT_PUBLIC_SITE_URL");
    expect(script).toContain("http://127.0.0.1:3001");

    const identity = readFileSync(
      resolve(process.cwd(), "scripts/dev-identity.mjs"),
      "utf8"
    );
    expect(identity).toContain("lxfdhnwjmtfbawznivbu");
    expect(identity).toContain("http://127.0.0.1:3000");
    expect(identity).toContain("PRIDMORA_ENV");

    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["dev:pilot"]).toContain("dev-pilot.mjs");
    expect(pkg.scripts?.dev).toContain("dev-identity.mjs");
    expect(pkg.scripts?.["auth:reliability-gate"]).toContain(
      "auth-reliability-gate.mjs"
    );
  });

  it("Pilot env file targets Pilot project and 127.0.0.1 site origin", () => {
    const path = resolve(process.cwd(), ".env.pilot.local");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain(
      `https://${PILOT_PROJECT_REF}.supabase.co`
    );
    expect(text).toContain("NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3001");
    expect(text).not.toContain("NEXT_PUBLIC_SITE_URL=http://localhost");
  });
});
