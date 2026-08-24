import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const CREATE_CALL =
  /(?:openai\.|input\.openai\.)?(?:responses\.create|chat\.completions\.create)\(\s*\{/g;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsFiles(full, out);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function extractObjectLiteral(source: string, openBraceIndex: number): string | null {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  return null;
}

function productionOpenAiCreateBodies(): Array<{
  file: string;
  api: "responses" | "chat.completions";
  body: string;
}> {
  const results: Array<{
    file: string;
    api: "responses" | "chat.completions";
    body: string;
  }> = [];

  for (const abs of [
    ...walkTsFiles(join(root, "app")),
    ...walkTsFiles(join(root, "lib")),
  ]) {
    const source = readFileSync(abs, "utf8");
    if (
      !source.includes("responses.create") &&
      !source.includes("chat.completions.create")
    ) {
      continue;
    }

    for (const match of source.matchAll(CREATE_CALL)) {
      const openBrace = source.indexOf("{", match.index ?? 0);
      const body = extractObjectLiteral(source, openBrace);
      if (!body) {
        throw new Error(`Unable to parse OpenAI create body in ${abs}`);
      }
      results.push({
        file: abs.replace(`${root}/`, ""),
        api: match[0].includes("chat.completions")
          ? "chat.completions"
          : "responses",
        body,
      });
    }
  }

  return results;
}

describe("OpenAI store: false privacy hardening", () => {
  it("finds every production Responses and Chat Completions create call", () => {
    const calls = productionOpenAiCreateBodies();
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.some(c => c.api === "chat.completions")).toBe(true);
    expect(calls.some(c => c.api === "responses")).toBe(true);
    expect(calls.some(c => c.file.includes("person-level-openai"))).toBe(true);
    expect(calls.some(c => c.file.includes("organisation-intelligence"))).toBe(
      true
    );
    expect(
      calls.every(
        c =>
          c.file.includes("person-level-openai") ||
          c.file.includes("organisation-intelligence")
      )
    ).toBe(true);
  });

  it("sets store: false on every production OpenAI create call body", () => {
    const calls = productionOpenAiCreateBodies();
    const missing = calls.filter(c => !/\bstore\s*:\s*false\b/.test(c.body));
    expect(missing).toEqual([]);
  });

  it("keeps Manager Aurelia Responses calls on store: false", () => {
    const wrapper = readFileSync(
      join(root, "lib/ai/person-level-openai.ts"),
      "utf8"
    );
    expect(wrapper).toContain("store: false");
    const chat = readFileSync(
      join(root, "app/api/my-development/aurelia/chat/route.ts"),
      "utf8"
    );
    const propose = readFileSync(
      join(root, "app/api/my-development/aurelia/propose-capture/route.ts"),
      "utf8"
    );
    expect(chat).toContain("createPersonLevelResponse");
    expect(propose).toContain("createPersonLevelResponse");
  });
});
