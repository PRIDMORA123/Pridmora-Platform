#!/usr/bin/env node
/**
 * Visible branding audit for Pridmora Development Platform.
 * Fails on user-facing legacy product brand strings.
 * Does not rewrite source files.
 *
 * Usage: node scripts/audit-visible-branding.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();

const INCLUDE_EXT = new Set([
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".md",
  ".css",
  ".html",
  ".json",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "tmp",
  "coverage",
  ".git",
  "dist",
  "build",
  "supabase",
]);

const VISIBLE_LEGACY_PATTERNS = [
  {
    name: "Identity Intelligence",
    re: /Identity Intelligence/,
  },
  {
    name: "Identity Workspace",
    re: /Identity Workspace/,
  },
  {
    name: "Professional Identity Journey",
    re: /Professional Identity Journey™?/,
  },
  {
    name: "Identity Journey (product)",
    re: /(?<!professional |Professional |leadership |Leadership |sense of |current |Current )Identity Journey™?/,
  },
  {
    name: "Identity by Pridmora",
    re: /Identity by Pridmora/,
  },
  {
    name: "IDENTITY™ / Identity™ product mark",
    re: /\bIDENTITY™\b|\bIdentity™\b/,
  },
  {
    name: "Welcome to Identity",
    re: /Welcome to Identity\b/,
  },
  {
    name: "Return to Identity",
    re: /Return to Identity\b/,
  },
  {
    name: "Identity-generated",
    re: /Identity-generated/,
  },
  {
    name: "Identity as product actor",
    re: /\bIdentity (will|reviews|brings|is|does|has)\b/,
  },
  {
    name: "Use Identity (product)",
    re: /\bUse Identity\b/,
  },
  {
    name: "Identity Summary (product)",
    re: /\bIdentity Summary\b/,
  },
  {
    name: "Identity Version (product)",
    re: /\bIdentity Version\b/,
  },
  {
    name: "IDENTITY EVOLUTION (product UI)",
    re: /\bIDENTITY EVOLUTION\b/,
  },
];

const INTERNAL_LEGACY_RE = [
  /\bIdentityButton\b/,
  /\bIdentityPanel\b/,
  /\bIdentityProductMark\b/,
  /\bIdentityIntelligencePanel\b/,
  /\bIdentitySystemPrompt\b/,
  /\bIDENTITY_SYSTEM_PROMPT\b/,
  /\bidentity_journey\b/,
  /\/api\/identity-journey/,
  /\.identity-[a-z0-9_-]+/,
  /identity-design-system/,
  /identity-tokens/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") && entry !== ".env.local.example") continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry)) continue;
      walk(full, out);
      continue;
    }
    if (!INCLUDE_EXT.has(extname(entry))) continue;
    out.push(full);
  }
  return out;
}

function isCommentOnlyHit(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("#")
  );
}

function isGuardAssertion(line) {
  // Tests/scripts that assert legacy branding is absent.
  return (
    /\.not\.(toContain|toMatch)\(/.test(line) ||
    /not\.toMatch\(/.test(line) ||
    /not\.toContain\(/.test(line)
  );
}

function isLikelyInternalLine(line, fileRel) {
  const normalised = fileRel.replace(/\\/g, "/");

  if (isCommentOnlyHit(line)) return true;
  if (isGuardAssertion(line)) return true;

  // Migration / API compatibility paths
  if (
    /(^|\/)(migrations|api\/identity-journey|api\/intelligence)(\/|$)/.test(
      normalised
    )
  ) {
    return true;
  }

  // CSS selectors / class names / imports of legacy namespaces
  if (
    /\.identity-|identity-design-system|identity-tokens|identity-intelligence|from ["']@\/components\/identity|IdentityButton|IdentityPanel|IdentityProductMark|IdentityIntelligence|IDENTITY_SYSTEM_PROMPT|identity_journey|\/api\/identity-journey|IdentityPathMark|IdentityPageHeader|IdentityProcessingState|IdentityEvidence|IdentityInsight|IdentityPattern|IdentityObservation|IdentityApproved|IdentityCoach|IdentityReview|IdentityEmpty|buildProfessionalIdentity|CURRENT PROFESSIONAL IDENTITY|professional identity/.test(
      line
    )
  ) {
    return true;
  }

  // Coaching-concept theme seed value — not product branding
  if (/themes:.*["']Identity["']/.test(line)) return true;

  // Tests covering legacy compatibility identifiers
  if (
    normalised.includes("tests/") &&
    /legacy|compatibility|IdentityButton|identity-/.test(line)
  ) {
    return true;
  }

  return false;
}

const files = walk(ROOT);
const visibleHits = [];
let internalCount = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  if (
    rel === "scripts/audit-visible-branding.mjs" ||
    rel === "lib/brand.ts"
  ) {
    const text = readFileSync(file, "utf8");
    for (const re of INTERNAL_LEGACY_RE) {
      const matches = text.match(new RegExp(re.source, "g"));
      if (matches) internalCount += matches.length;
    }
    continue;
  }

  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  for (const re of INTERNAL_LEGACY_RE) {
    const matches = text.match(new RegExp(re.source, "g"));
    if (matches) internalCount += matches.length;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isLikelyInternalLine(line, rel)) continue;

    for (const pattern of VISIBLE_LEGACY_PATTERNS) {
      if (pattern.re.test(line)) {
        visibleHits.push({
          file: rel,
          line: i + 1,
          pattern: pattern.name,
          text: line.trim().slice(0, 160),
        });
      }
    }
  }
}

console.log(`Visible legacy branding: ${visibleHits.length}`);
console.log(`Internal legacy identifiers: ${internalCount}`);

if (visibleHits.length > 0) {
  console.log("\nVisible legacy references:");
  for (const hit of visibleHits) {
    console.log(`  ${hit.file}:${hit.line} [${hit.pattern}] ${hit.text}`);
  }
  process.exit(1);
}

console.log("\nAudit passed.");
process.exit(0);
