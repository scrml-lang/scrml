#!/usr/bin/env bun
/**
 * scripts/claim-gate-c2.js
 *
 * The C2 (derived-number) half of the marketing claim-gate (S473). C1 — every public scrml fence
 * compiles — lives in scripts/claim-gate.js, which imports this module and runs it over the same
 * public surface (scripts/claim-gate-surface.js), so C2 rides the same CI `checks` step.
 *
 * WHY. scripts/facts.ts states the policy: a public document SHALL cite docs/FACTS.md rather than
 * hardcode a figure that decays. Nothing enforced it, and DESIGN.md said "The spec is 18,000 lines.
 * The compiler has 5,500+ tests." for months after the spec passed 50,000 lines.
 *
 * THE RULE. On the public surface, a NUMBER next to a REPO-DERIVED NOUN (lines, tests, test files,
 * modules, conformance cases, codes, diagnostics, verbs, subcommands, sections) fails unless the
 * same line or the same paragraph cites `docs/FACTS.md` (any mention of `FACTS.md`). A line that
 * carries `<!-- claim: not-derived -->` (optionally `<!-- claim: not-derived — reason -->`) is
 * exempt: the number is not repo-derived.
 *
 * WHAT IS NOT A HIT (tuned on the real surface, S473):
 *   - a number inside a fenced code block (C1 gates fences) or an inline `code span`;
 *   - a section / version / gap reference: a number preceded by `§`, `.`, `#`, a letter or a digit
 *     (`§66.3 rules`, `v0.8.0`, `impl#1`, `E-SYNTAX-042`);
 *   - a range (`5–15 lines`, `10-30 lines`): prose about code size, not a claim about the repo;
 *   - a singular noun (`a 1 module`, `Tier 0 code`): a count claim is plural;
 *   - a hyphenated adjective (`3-line config`).
 * Up to two plain words may stand between the number and the noun (`53,539 spec lines`,
 * `14 CLI verbs`, `1,800 conformance cases`).
 *
 * CLI: `bun scripts/claim-gate-c2.js [paths...]` — scans the given markdown files (default: the
 * resolved public surface via claim-gate.js), prints each hit, exits 1 on any.
 */

import { readFileSync } from "fs";

export const OPT_OUT_RE = /<!--\s*claim:\s*not-derived\b[^>]*-->/;
const CITE_RE = /FACTS\.md/;

/** Plural repo-derived nouns (longest first is irrelevant: the noun is matched as a whole word). */
export const DERIVED_NOUNS = [
  "lines", "LOC", "tests", "files", "modules", "cases", "codes", "diagnostics",
  "verbs", "subcommands", "sections",
];

// number: digits with optional thousands separators / decimal, optional `+`, `k`/`K`, `+`.
// Not preceded by § . # – - a letter or a digit (refs, versions, codes, the far end of a range).
// Not followed by a range dash. Then 0–2 plain words, then a derived noun as a whole word.
const NUM = String.raw`(?<![§.#\-–—\w])~?\d(?:[\d,]*\d)?(?:\.\d+)?\+?[kK]?\+?(?![\d,]*[–\-—]\s?\d)`;
// An intervening word is a modifier ("spec", "CLI", "conformance"), never a function word: "exit 0
// with zero diagnostics" is not a count of diagnostics.
const STOP = "with|of|and|or|the|a|an|to|in|at|for|by|from|on|as|is|are|was|were|no|zero|not|than|per|into|onto";
const WORD = String.raw`(?!(?:${STOP})\b)[A-Za-z][A-Za-z]*`;
const CLAIM_RE = new RegExp(
  String.raw`${NUM}(?:\s+${WORD}){0,2}\s+(?:${DERIVED_NOUNS.join("|")})\b`,
  "g",
);

/** Strip inline code spans (a `5 tests` in backticks is code, not a claim). */
const stripCode = (line) => line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

/**
 * Every uncited derived-number claim in a markdown text.
 * @param {string} text
 * @returns {{ line: number, match: string, text: string }[]}
 */
export function findDerivedNumberClaims(text) {
  const lines = text.split("\n");
  // Paragraph id per line: contiguous non-blank lines outside fences share one id.
  const para = new Array(lines.length).fill(-1);
  const inFence = new Array(lines.length).fill(false);
  let fence = null;
  let pid = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = l.match(/^\s*(```+|~~~+)/);
    if (fence) {
      inFence[i] = true;
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) { fence = f[1]; inFence[i] = true; pid++; continue; }
    if (l.trim() === "") { pid++; continue; }
    para[i] = pid;
  }
  const citedPara = new Set();
  for (let i = 0; i < lines.length; i++) if (para[i] >= 0 && CITE_RE.test(lines[i])) citedPara.add(para[i]);

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i] || para[i] < 0) continue;
    const raw = lines[i];
    if (OPT_OUT_RE.test(raw) || citedPara.has(para[i])) continue;
    for (const m of stripCode(raw).matchAll(CLAIM_RE)) {
      out.push({ line: i + 1, match: m[0].replace(/\s+/g, " "), text: raw.trim() });
    }
  }
  return out;
}

/** Scan files; returns hits tagged with their file. */
export function scanFiles(files) {
  const out = [];
  for (const file of files) for (const h of findDerivedNumberClaims(readFileSync(file, "utf8"))) out.push({ file, ...h });
  return out;
}

export const C2_HINT =
  "cite docs/FACTS.md on the same line or paragraph (e.g. \"over 50,000 lines (current figure: docs/FACTS.md)\"), " +
  "drop or rephrase the number, or — only for a number that is NOT repo-derived — mark the line `<!-- claim: not-derived -->`";

if (import.meta.main) {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (paths.length === 0) {
    console.error("usage: bun scripts/claim-gate-c2.js <file.md>...   (the full surface runs inside `bun scripts/claim-gate.js`)");
    process.exit(2);
  }
  const hits = scanFiles(paths);
  for (const h of hits) console.log(`${h.file}:${h.line}: «${h.match}» — uncited derived figure`);
  console.log(`claim-gate C2: ${hits.length} uncited derived-number claim(s) in ${paths.length} file(s).`);
  if (hits.length) console.log(C2_HINT);
  process.exit(hits.length ? 1 : 0);
}
