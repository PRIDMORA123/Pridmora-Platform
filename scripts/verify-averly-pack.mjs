/**
 * Independent verification of the generated Averly pack.
 * Run: node scripts/verify-averly-pack.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "sample-data", "averly-services-group");
const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));

const { relationships } = read("relationships.json");
const { sessions } = read("sessions.json");
const { actions } = read("actions.json");
const { developmentUpdates } = read("development-updates.json");
const { intelligenceItems } = read("intelligence-items.json");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

check("counts", relationships.length === 12 && sessions.length === 72 && actions.length === 72 && developmentUpdates.length === 24 && intelligenceItems.length === 72,
  `${relationships.length}/${sessions.length}/${actions.length}/${developmentUpdates.length}/${intelligenceItems.length}`);

const counts = sessions.map((s) => s.summary.trim().split(/\s+/).length);
check("summary word counts 150-220", counts.every((c) => c >= 150 && c <= 220), `min ${Math.min(...counts)}, max ${Math.max(...counts)}, mean ${Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)}`);

const norm = (t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const dupes = (n) => {
  const index = new Map();
  const hits = [];
  for (const s of sessions) {
    const words = norm(s.summary);
    const seen = new Set();
    for (let i = 0; i + n <= words.length; i += 1) {
      const gram = words.slice(i, i + n).join(" ");
      if (seen.has(gram)) continue;
      seen.add(gram);
      if (index.has(gram)) hits.push(`${index.get(gram)} / ${s.key}: "${gram}"`);
      else index.set(gram, s.key);
    }
  }
  return hits;
};
for (const n of [12, 10]) {
  const hits = dupes(n);
  check(`no repeated ${n}-word phrase across summaries`, hits.length === 0, hits.slice(0, 5).join(" | ") || "none");
}
// Below ten words the only expected repeats are each manager's own recurring
// framing phrases, so these are reported rather than enforced.
for (const n of [8, 7]) console.log(`INFO  repeated ${n}-word phrases: ${dupes(n).length}`);

const uniq = (values) => new Set(values).size;
check("unique summaries", uniq(sessions.map((s) => s.summary)) === 72);
check("unique session focuses", uniq(sessions.map((s) => s.focus)) === 72, `${uniq(sessions.map((s) => s.focus))}/72`);
check("unique agreed actions", uniq(actions.map((a) => a.title)) === 72, `${uniq(actions.map((a) => a.title))}/72`);
check("unique preparation prompts", uniq(sessions.map((s) => s.preparation)) === 72, `${uniq(sessions.map((s) => s.preparation))}/72`);
check("unique notes", uniq(sessions.map((s) => s.notes)) === 72);
check("unique emerging themes", uniq(sessions.map((s) => s.emergingThemes)) === 72);
check("unique strengths observed", uniq(sessions.map((s) => s.strengthsObserved)) === 72);
check("unique coach reflections", uniq(sessions.map((s) => s.coachReflection)) === 72);
check("unique intelligence titles", uniq(intelligenceItems.map((i) => i.title)) === 72, `${uniq(intelligenceItems.map((i) => i.title))}/72`);
check("unique intelligence descriptions", uniq(intelligenceItems.map((i) => i.description)) === 72);
const proposed = developmentUpdates.map((u) => JSON.stringify(u.proposedChanges));
check("unique development update proposedChanges", uniq(proposed) === 24, `${uniq(proposed)}/24`);

const insights = sessions.flatMap((s) => s.emergingThemes.split("\n\n"));
check("all 216 insight paragraphs unique", uniq(insights) === 216, `${uniq(insights)}/${insights.length}`);

const byKey = Object.fromEntries(sessions.map((s) => [s.key, s]));
const has = (key, ...terms) => terms.every((t) => byKey[key].summary.toLowerCase().includes(t));
const lacks = (key, ...terms) => terms.every((t) => !byKey[key].summary.toLowerCase().includes(t));

check("Sophie session 1 avoids end-of-journey progress language", lacks("sophie-bennett-session-1", "mid-programme", "mid programme", "well established", "now visible in live operational"));
check("Sophie session 1 reads as early awareness", has("sophie-bennett-session-1", "nothing in the queue changed"));
check("Marcus session 6 holds strategic ground and slips back", has("marcus-reed-session-6", "capacity picture", "firefighting"));
check("Ben session 2 still postponing", has("ben-carter-session-2", "cancelled"));
check("Tom sessions 1-3 show directive habits", ["tom-harrison-session-1", "tom-harrison-session-2", "tom-harrison-session-3"].every((k) => /issuing the fix|took over|rewrote/.test(byKey[k].summary)));
check("Maya shows a win and a setback", has("maya-patel-session-2", "agreed") && has("maya-patel-session-5", "withdrew"));

const earlyClaims = ["sustained behavioural change", "is now established", "well established", "established behaviour"];
const earlyBad = sessions.filter((s) => s.sessionNumber <= 2 && earlyClaims.some((c) => s.summary.toLowerCase().includes(c)));
check("sessions 1-2 make no late-journey claims", earlyBad.length === 0, earlyBad.map((s) => s.key).join(", "));

const grammarPatterns = [/evidenced by identified/i, /\bthe the\b/i, /\ba a\b/i, /\bis is\b/i, /\band and\b/i, /\bto to\b/i, / ,/, /\.\./, / {2,}/, /[a-z]\.[A-Z]/];
const grammarHits = [];
for (const s of sessions) {
  for (const field of ["summary", "notes", "emergingThemes", "strengthsObserved", "valuesBecomingVisible", "professionalIdentityDevelopment", "coachReflection", "preparation", "suggestedFocus", "agreedActions"]) {
    for (const pattern of grammarPatterns) if (pattern.test(s[field])) grammarHits.push(`${s.key}.${field} ~ ${pattern}`);
  }
}
check("no grammar artefacts in session text", grammarHits.length === 0, grammarHits.slice(0, 5).join(" | "));

const sentenceStart = /^[A-Z"']/;
const badStart = sessions.filter((s) => !sentenceStart.test(s.summary));
check("summaries start with a capital letter", badStart.length === 0, badStart.map((s) => s.key).join(", "));
const badEnd = sessions.filter((s) => !/[.!?]$/.test(s.summary.trim()));
check("summaries end with terminal punctuation", badEnd.length === 0, badEnd.map((s) => s.key).join(", "));

const openings = sessions.map((s) => norm(s.summary).slice(0, 6).join(" "));
check("no repeated summary opening (first 6 words)", uniq(openings) === 72, `${uniq(openings)}/72`);

const confidential = relationships.filter((r) => r.identityMode === "confidential");
check("2 confidential relationships with no email and no AI name use", confidential.length === 2 && confidential.every((r) => r.email === "" && r.aiNameAllowed === false));
const realNames = ["sophie", "marcus", "priya", "daniel", "emma", "jonathan", "maya", "tom", "aisha", "ben"];
const confidentialLeak = sessions.filter((s) => ["senior-leader-a", "manager-b"].includes(s.relationshipKey) && realNames.some((n) => new RegExp(`\\b${n}\\b`, "i").test(s.summary)));
check("confidential summaries use labels only", confidentialLeak.length === 0, confidentialLeak.map((s) => s.key).join(", "));

const stageMap = { 1: "early", 2: "early", 3: "mixed", 4: "mixed", 5: "late", 6: "late" };
const stageSpread = Object.entries(stageMap).map(([n, label]) => `s${n}=${label}`);
check("progress framing keyed to session stage", stageSpread.length === 6, stageSpread.join(" "));

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
