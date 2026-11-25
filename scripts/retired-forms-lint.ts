#!/usr/bin/env bun
/**
 * scripts/retired-forms-lint.ts — the RETIRED-FORMS GATE (S482, s482-retired-lint; fix round r1 of #2101).
 *
 * WHY. A retired form survived in the SPEC's own examples for seven months after Appendix E retired it
 * (2026-04-09), was copied into a conformance case and the bootstrap, and was re-adopted as a "terse
 * `/}` closer" (S482 audit, ~/.cache/scrml/review/s482-retired-audit/report.md). Root cause: no gate read
 * SPEC fences (claim-gate.js excludes SPEC by design), retirements landed as banners instead of
 * migrations, and bulk SPEC rewrites preserved the retired text. Owner: "if I cant trust that language
 * rulings from that long ago are being honered, how am I supposed to believe that we are on the right
 * track?"
 *
 * RULINGS (scrml-support/user-voice-scrml.md):
 *   S482 "⭐ RULED — every retirement / deprecation PR adds a retired-forms ledger row and migrates" —
 *     "hard forms fail CI outside labelled negatives; soft counts may not rise".
 *   S482 "⭐ RULED — every SPEC example is in the current language, except labelled negatives and marked
 *     deprecated demonstrations" (R1).
 *
 * WHAT THE GATE CHECKS — exactly this, and SPEC §63's ledger paragraph says the same (keep them equal):
 *   1. READS every ledger row with a detector (compiler/retired-forms.json) over:
 *        - .scrml files under SCRML_ROOTS, minus EXCLUDED / SKIP_DIRS;
 *        - every .md file of the tree minus EXCLUDED (each with its reason) and SKIP_DIRS / dot-directories:
 *          every fence whose info string is empty or STARTS `scrml` (`scrml{.example}`, `scrml,ignore`),
 *          blockquoted fences included (`> ```scrml`: the `>` markers are stripped, lines kept). Fences
 *          tagged another language, indented code blocks, HTML `<pre>` blocks and prose are not read.
 *      Source is read by one source-order walker (scripts/retired-forms-walk.ts, a port of the bootstrap's
 *      readers): comments, strings, raw bodies (`<pre>` `<code>` `<script>` `<style>`; an unclosed one only
 *      to the next closing tag), foreign / SQL / CSS bodies (string-aware brace count) and the free text of
 *      a closed HTML element are never matched. Regex detectors match over the WHOLE text (a line break is
 *      whitespace) and every match is one hit.
 *   2. ALLOWS a hit only when:
 *        - it is in a conformance / acceptance case's OWN file (case.scrml, or a file the case names) and
 *          the case is a NEGATIVE for that row: expected.json `expect.codes` / `codeCounts` names one of the
 *          row's codes (a generic-code row — `caseIdPattern` set — also needs the case id to match), and
 *          that code's budget is not spent: one hit per expected occurrence (`codeCounts[code]`, else 1),
 *          shared by the rows that share the code;
 *        - a markdown fence is marked as a negative by `<!-- retired-neg: <row-id> — <reason> -->` on the
 *          line(s) directly above its opener (one marker per row; consecutive marker lines stack);
 *        - the fence lies in a SPEC migration region (the ledger's `migrationRegions`): opened ONLY by a
 *          heading line exactly equal to a listed one (which must stand exactly once), holding only its own
 *          sub-headings (`children`), closed by any other heading;
 *        - `retired-ok: <row-id> — <reason>` stands in a COMMENT (`//`, `/* *\/`, `<!-- -->`) on the hit's
 *          line or the line before it (exact id, a non-empty reason).
 *      A code named in prose or in a comment allows nothing.
 *   3. COUNTS: every (row, file) count must EQUAL the baseline (scripts/retired-forms-baseline.json):
 *        - a HARD hit with no `pending` entry fails; a count above the baseline fails;
 *        - a count BELOW the baseline also fails until the baseline is lowered (`--update`), so slack is
 *          never left for a later PR to spend;
 *        - a migration-region heading missing or repeated fails.
 *   4. With `--base-ref <rev>` (CI: the PR's base; the pre-commit hook: the merge-base with origin/main; an
 *      unresolvable rev exits 2) the baseline and ledger themselves are checked against that revision's:
 *        - no (row, file) count above the base's, no (row, file) key the base lacks — except a SOFT row the
 *          base ledger lacks (a new deprecation records its starting count); a new HARD row brings no debt;
 *        - no ledger row removed, none downgraded HARD -> SOFT, no detector set to null;
 *        - the BASE ledger's rules (each base row's detector / codes / caseIdPattern, the base regions) run
 *          over this tree find no (row, file) count above the base baseline (#2101 r2 MED-3): a widened
 *          `codes` / `caseIdPattern`, a narrowed or never-matching detector, a new region cannot hide a hit.
 *
 * KNOWN LIMITS (also in SPEC §63):
 *   - counts are per (row, file): removing one hit and adding another of the same row in the same file
 *     passes (a swap); in a negative case, which hit its budget allows is not tied to a diagnostic's line;
 *   - the walker and builtin detectors are this tree's script: narrowing them is a reviewed code diff the
 *     base rules do not catch; a base ledger older than `migrationRegions` is read with this tree's regions;
 *   - text cannot tell a tape from a host array (tape-js-method) or a cell from an element (render-by-tag,
 *     detector null); rows with `enforcedBy: "lint-only"` have no compiler refusal, the lint alone holds
 *     them; tape-js-method sees no computed member (`xs["push"](1)`) and a discarded `.sort()` only after
 *     `;` / `{` / `}`;
 *   - a fence tagged as another language, an indented code block, an HTML `<pre>` block and prose are not
 *     read; a retired closer inside an unclosed raw body is raw text here (the bootstrap names it);
 *   - the pre-commit hook lints the working tree, not the index (CI lints the commit);
 *   - the path-word exemption of the closer rule (`a/b/`, `http://x.com/`) is the bootstrap's INTERIM.
 *
 * USAGE
 *   bun scripts/retired-forms-lint.ts                    check (exit 1 on any failure above)
 *   bun scripts/retired-forms-lint.ts --base-ref <rev>   also check the baseline / ledger against <rev>'s
 *   bun scripts/retired-forms-lint.ts --update           lower the baseline to the current counts (never up)
 *   bun scripts/retired-forms-lint.ts --init             write the baseline (only when none exists)
 *   bun scripts/retired-forms-lint.ts --json             machine-readable report on stdout
 *   bun scripts/retired-forms-lint.ts --list <id>        every hit of one row (file:line: text)
 *   bun scripts/retired-forms-lint.ts --quiet            one summary line unless it fails (the pre-commit hook)
 *   bun scripts/retired-forms-lint.ts --root <dir>       scan another tree;  --ledger / --baseline <path>
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { analyze, view, K_COMMENT, type Analysis } from "./retired-forms-walk.ts";

export type Detector = { kind: "regex"; pattern: string; flags: string } | { kind: "builtin"; name: string } | null;
export type Row = {
  id: string; tier: "HARD" | "SOFT"; old: string; new: string; codes: string[]; spec: string; ruling: string;
  detector: Detector; keepStrings?: boolean; caseIdPattern?: string; enforcedBy?: string; note?: string;
};
export type Ledger = { rows: Row[]; migrationRegions?: Region[] };
export type Hit = { row: string; file: string; line: number; text: string };
export type Baseline = {
  $comment?: string;
  soft: Record<string, Record<string, number>>;
  pending: Record<string, { since: string; why: string; files: Record<string, number> }>;
};

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LEDGER_PATH = "compiler/retired-forms.json";
export const BASELINE_PATH = "scripts/retired-forms-baseline.json";

export const SCRML_ROOTS = ["conformance/cases", "compiler/self-host-v2/acceptance", "samples", "examples", "stdlib",
  "docs/tutorial-snippets", "docs/readme-snippets", "docs/website"];
export const SPEC_PATH = "compiler/SPEC.md";
/**
 * Paths NOT read, each with its reason (#2101 r2 LOW-5: every `.md` file in the tree is read — its `scrml`
 * and untagged fences — except these; `.scrml` files are read under SCRML_ROOTS, minus these). A path is
 * excluded when it equals an entry or lies under one. SKIP_DIRS below are skipped at any depth.
 */
export const EXCLUDED: Record<string, string> = {
  "handOffs": "PA hand-off notes (session records)",
  "spa-lists": "sPA task lists and their progress notes (working records)",
  "pa.md": "PA working instructions", "cpa.md": "cPA working instructions", "spa.md": "sPA working instructions",
  "vpa.md": "vPA working instructions", "hand-off.md": "the PA hand-off (a session record)",
  "master-list.md": "the PA's master work list", "gaunt.md": "gauntlet working notes", "scrmlFormula.md": "PA working notes",
  "compiler/native-parser": "dated scoping and divergence notes of the native-parser milestones (a record)",
  "compiler/self-host-v2/progress.md": "bootstrap progress notes (a record)",
  "compiler/self-host-v2/slice-m1/progress.md": "bootstrap slice progress notes (a record)",
  "compiler/self-host-v2/slice-m2/progress.md": "bootstrap slice progress notes (a record)",
  "compiler/SPEC-INDEX.md": "generated from the SPEC (scripts/regen-spec-index.ts)",
  "compiler/PIPELINE.md": "impl#1's stage contracts: no scrml fence; its untagged fences are TypeScript type listings",
  "scripts/flograph-fixture": "a test fixture",
  "tryit": "untracked local playground (gitignored)",
  "docs/changes": "per-change progress notes and hand-offs (the record of a change, quoting the code it changed)",
  "docs/changelog.md": "the changelog (history)",
  "docs/generated": "bot-generated blocks",
  "docs/FACTS.md": "bot-generated facts",
  "docs/known-gaps.md": "the gap ledger (generated counts; entries quote the defect they track)",
  "docs/bootstrap-conformance.md": "generated by scripts/bootstrap-conformance.ts --write",
  "docs/pr-reviews.md": "the review ledger (a record of past PRs)",
  "docs/heads-up": "dated hand-off notes",
  "docs/audits": "dated point-in-time audits (they quote the code they audited)",
  "docs/curation": "a dated disposition record",
  "docs/articles/archive": "archived drafts (S469 \"Archive old drafts\")",
  "compiler/tests": "test fixtures' READMEs",
  "compiler/src": "impl#1 (frozen) internals",
  "benchmarks": "other frameworks' benchmark apps",
  "node_modules": "dependencies",
};
/** Directory names skipped at any depth, with the reason (#2101 r2 LOW-5: `archive` is no longer one —
 *  the one archive the tree holds, docs/articles/archive, is listed in EXCLUDED). Every dot-directory
 *  (`.git`, `.github`, `.claude`, …: tool state and CI configuration) is skipped too. */
export const SKIP_DIRS: Record<string, string> = {
  "node_modules": "dependencies",
  "dist": "build output (gitignored everywhere)",
};

/** A repo-relative path, always `/`-separated (#2101 r1 HIGH-4: keys and prefixes are posix on every OS). */
export const posix = (p: string) => p.replace(/\\/g, "/");
const excluded = (rel: string) => Object.keys(EXCLUDED).some((e) => rel === e || rel.startsWith(e + "/"));

// --------------------------------------------------------------------------------------------------
// detection
// --------------------------------------------------------------------------------------------------

let HTML_NAMES: Set<string> | null = null;
function htmlNames(root: string): Set<string> {
  if (HTML_NAMES) return HTML_NAMES;
  HTML_NAMES = new Set();
  const p = join(root, "compiler/self-host-v2/elements.scrml");
  if (existsSync(p)) {
    const src = readFileSync(p, "utf8");
    const at = src.indexOf("fn htmlElementNames");
    const body = src.slice(at, src.indexOf("];", at));
    for (const m of body.matchAll(/"([a-z][a-z0-9-]*)"/g)) HTML_NAMES.add(m[1]);
  }
  return HTML_NAMES;
}

type Read = { src: string; an: Analysis; code: string; keep: string; lineAt: Int32Array };
const READ_CACHE = new Map<string, Read>();
export function read(src: string, root: string): Read {
  let r = READ_CACHE.get(src);
  if (r) return r;
  if (READ_CACHE.size > 32) READ_CACHE.clear();
  const an = analyze(src, htmlNames(root));
  const lineAt = new Int32Array(src.length + 1);
  let ln = 1;
  for (let i = 0; i <= src.length; i++) { lineAt[i] = ln; if (src[i] === "\n") ln++; }
  r = { src, an, code: view(src, an.kinds, false), keep: view(src, an.kinds, true), lineAt };
  READ_CACHE.set(src, r);
  return r;
}

/** The `)` matching the `(` at `open` in a code view, or -1. */
function parenEnd(t: string, open: number): number {
  let d = 0;
  for (let i = open; i < t.length; i++) {
    if (t[i] === "(") d++;
    else if (t[i] === ")") { d--; if (d === 0) return i; }
  }
  return -1;
}

/** Builtin detectors: offsets of hits in a read text. */
const BUILTINS: Record<string, (r: Read) => number[]> = {
  "trailing-slash-closer": (r) => r.an.closerHits,
  "angle-cell-read": (r) => r.an.angleReads,
  /** `while (…)` — a loop head. A do-while TAIL (`} while (c)` with no body brace after its condition) is
   *  the do-while-loop row's. `if (a) { b() } while (x) { }` is a loop (its `{` follows). */
  "while-loop": (r) => {
    const out: number[] = [];
    for (const m of r.code.matchAll(/(?<![.\w$])while\s*\(/g)) {
      const open = m.index! + m[0].length - 1;
      const close = parenEnd(r.code, open);
      const before = r.code.slice(0, m.index!).trimEnd();
      const after = close < 0 ? "" : r.code.slice(close + 1).trimStart();
      if (before.endsWith("}") && !after.startsWith("{")) continue;    // a do-while tail
      out.push(m.index!);
    }
    return out;
  },
  /** §34 E-TAPE-JS-METHOD: (a) `.push(` `.unshift(` `.splice(` `.toSorted(` `.toReversed(` `.with(` in any
   *  position; (b) `.sort(` `.reverse(` `.fill(` `.copyWithin(` as a whole STATEMENT (its value discarded):
   *  the call is the statement's only expression — a plain receiver chain right after a statement
   *  boundary (`;`, a block `{`, `}`, the text start) and nothing but `;` / `}` / a line end after it. */
  "tape-js-method": (r) => {
    const out: number[] = [];
    const t = r.code;
    for (const m of t.matchAll(/\.\s*(?:push|unshift|splice|toSorted|toReversed|with)\s*\(/g)) out.push(m.index!);
    for (const m of t.matchAll(/\.\s*(?:sort|reverse|fill|copyWithin)\s*\(/g)) {
      let k = m.index!;
      while (k > 0 && /[\w$@.\[\]]/.test(t[k - 1])) k--;
      if (k === m.index!) continue;
      let b = k - 1;
      while (b >= 0 && /\s/.test(t[b])) b--;
      const boundary = b < 0 || t[b] === ";" || t[b] === "}" || (t[b] === "{" && t[b - 1] !== "$");
      if (!boundary) continue;
      const close = parenEnd(t, m.index! + m[0].length - 1);
      if (close < 0) continue;
      const rest = t.slice(close + 1, close + 200);
      if (/^[ \t]*(?:;|\}|\r?\n|$)/.test(rest)) out.push(m.index!);
    }
    return out.sort((a, b) => a - b);
  },
  /** `function f(…): T` / `fn f(…): T` — params may nest parens and span lines. */
  "return-type-colon": (r) => {
    const out: number[] = [];
    for (const m of r.code.matchAll(/(?<![.\w$])(?:function|fn)\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*(?:<[^<>()]*>)?\s*\(/g)) {
      if (/^fn\s*\(/.test(m[0])) continue;     // `fn(…)` with no name is a type / a lambda, not a declaration
      const close = parenEnd(r.code, m.index! + m[0].length - 1);
      if (close < 0) continue;
      if (/^\s*:\s*[A-Za-z_({\[]/.test(r.code.slice(close + 1, close + 200))) out.push(m.index!);
    }
    return out;
  },
  /** A function TYPE spelled with `->`: `(x: T) -> R` after a `:` (params may nest), or `fn(…)` in a type
   *  position (after `:` / `->` / `<` / `,` in a type) with no `=>` (§7.5: "`fn(…)` with no `=>`"). */
  "fn-type-arrow": (r) => {
    const out: number[] = [];
    for (const m of r.code.matchAll(/:\s*\(/g)) {
      const close = parenEnd(r.code, m.index! + m[0].length - 1);
      if (close >= 0 && /^\s*->/.test(r.code.slice(close + 1, close + 40))) out.push(m.index!);
    }
    for (const m of r.code.matchAll(/(?::|->)\s*fn\s*\(/g)) {
      const close = parenEnd(r.code, m.index! + m[0].length - 1);
      // `fn(x) { … }` is a lambda (a value), not a type
      if (close >= 0 && !/^\s*(?:=>|\{)/.test(r.code.slice(close + 1, close + 40))) out.push(m.index!);
    }
    return [...new Set(out)];
  },
};

/** Hit offsets of `row` in `src`. */
export function rowOffsets(row: Row, src: string, root: string): number[] {
  const d = row.detector;
  if (!d) return [];
  const r = read(src, root);
  if (d.kind === "builtin") {
    const f = BUILTINS[d.name];
    if (!f) throw new Error(`retired-forms-lint: unknown builtin detector ${d.name} (row ${row.id})`);
    return f(r);
  }
  const t = row.keepStrings ? r.keep : r.code;
  const flags = d.flags.includes("g") ? d.flags : d.flags + "g";
  const out: number[] = [];
  for (const m of t.matchAll(new RegExp(d.pattern, flags))) out.push(m.index!);
  return out;
}

/** One 1-based line per hit (a line holding two hits appears twice). */
export function rowLines(row: Row, src: string, root: string): number[] {
  const r = read(src, root);
  return rowOffsets(row, src, root).map((o) => r.lineAt[o]).sort((a, b) => a - b);
}

/** `retired-ok: <id> — <reason>` inside a COMMENT on line `line` or the line before (#2101 r1 MED-5). */
export function markerAllows(src: string, line: number, id: string, root: string): boolean {
  const r = read(src, root);
  const re = new RegExp(`retired-ok:[ \\t]*${id.replace(/[-]/g, "\\-")}(?![\\w-])[ \\t]*(?:—|--|-|:)[ \\t]*\\S`, "g");
  const lines = src.split("\n");
  let off = 0;
  const starts: number[] = [];
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  for (const ln of [line, line - 1]) {
    if (ln < 1 || ln > lines.length) continue;
    for (const m of lines[ln - 1].matchAll(re)) {
      if (r.an.kinds[starts[ln - 1] + m.index!] === K_COMMENT) return true;
    }
  }
  return false;
}

// --------------------------------------------------------------------------------------------------
// the corpus
// --------------------------------------------------------------------------------------------------

function walk(root: string, rel: string, test: (rel: string) => boolean, out: string[]) {
  rel = posix(rel);
  if (excluded(rel)) return;
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  if (statSync(abs).isFile()) { if (test(rel)) out.push(rel); return; }
  for (const e of readdirSync(abs).sort()) {
    if (Object.hasOwn(SKIP_DIRS, e) || e.startsWith(".")) continue;
    walk(root, rel === "" ? e : `${rel}/${e}`, test, out);
  }
}

export function scrmlFiles(root: string): string[] {
  const out: string[] = [];
  for (const r of SCRML_ROOTS) walk(root, r, (f) => f.endsWith(".scrml"), out);
  return [...new Set(out)].sort();
}

export function mdFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, "", (f) => f.endsWith(".md"), out);
  return [...new Set(out)].sort();
}

/**
 * A conformance / acceptance case: its id, its expected codes, `budget` — how many hits each expected code
 * may allow (#2101 r2 LOW-6: `codeCounts[code]`, else 1 for a code in `codes`; consumed across the case's
 * files, in file then source order) — and the text that names its files (case.scrml + expected.json).
 */
export type Case = { id: string; codes: string[]; dir: string; budget: Map<string, number>; names: string };

/** The conformance / acceptance case holding `rel`, or null. */
function caseOf(root: string, rel: string, cache: Map<string, Case | null>): Case | null {
  if (!rel.startsWith("conformance/cases/") && !rel.startsWith("compiler/self-host-v2/acceptance/")) return null;
  for (let dir = dirname(rel); dir.includes("/"); dir = dirname(dir)) {
    if (cache.has(dir)) return cache.get(dir)!;
    const p = join(root, dir, "expected.json");
    if (existsSync(p)) {
      let c: Case | null = null;
      try {
        const raw = readFileSync(p, "utf8");
        const ex = JSON.parse(raw);
        const cc: Record<string, number> = ex?.expect?.codeCounts ?? {};
        const codes: string[] = [...(ex?.expect?.codes ?? []), ...Object.keys(cc)];
        const budget = new Map<string, number>();
        for (const code of codes) budget.set(code, typeof cc[code] === "number" ? cc[code] : 1);
        const cs = join(root, dir, "case.scrml");
        c = { id: String(ex?.id ?? dir.split("/").pop()), codes, dir, budget, names: raw + "\n" + (existsSync(cs) ? readFileSync(cs, "utf8") : "") };
      } catch { c = null; }
      cache.set(dir, c);
      return c;
    }
  }
  return null;
}

/** Is `rel` one of the case's own files — its `case.scrml`, or a file the case names (an import of
 *  case.scrml, or a path in expected.json) (#2101 r2 LOW-6)? A helper the case never names is not. */
export function caseOwns(c: Case, rel: string): boolean {
  const own = rel.slice(c.dir.length + 1);
  if (own === "case.scrml") return true;
  return c.names.includes(own);
}

/** The case's codes that may allow a hit of `row` (#2101 r1 HIGH-2): the row's codes the case expects, and
 *  for a generic-code row only when its `caseIdPattern` matches the case id. */
export function caseCodesFor(row: Row, c: Case | { id: string; codes: string[] } | null): string[] {
  if (!c) return [];
  const codes = row.codes.filter((code) => c.codes.includes(code));
  if (codes.length && row.caseIdPattern && !new RegExp(row.caseIdPattern).test(c.id)) return [];
  return codes;
}

/** Is the case a labelled negative for `row` at all (before its per-code budget)? */
export function caseIsNegativeFor(row: Row, c: { id: string; codes: string[] } | null): boolean {
  return caseCodesFor(row, c).length > 0;
}

export type Fence = { startLine: number; text: string; negIds: Set<string>; migration: boolean; info: string };

/**
 * A SPEC migration region (#2101 r2 MED-1): opened ONLY by a heading line EXACTLY equal to `heading` (the
 * ledger's `migrationRegions`; the SPEC must hold it exactly once — `regionErrors`), and holding only its own
 * sub-headings — a deeper heading whose text does not match `children` (e.g. a misplaced `19.15` under
 * Appendix E, a `4.1` under §63) ends the region, as does any heading of its level or higher. Heading TEXT
 * alone never opens a region: `#### 63.99 Worked example` inside §4 is an ordinary heading.
 */
export type Region = { heading: string; children: string; why?: string };

/** A line's blockquote prefix (`> `, `> > `, `>   `) stripped (#2101 r2 MED-2), and how many `>` it held. */
function unquote(line: string): { text: string; depth: number } {
  const m = /^(?:[ \t]{0,3}>[ \t]?)+/.exec(line);
  if (!m) return { text: line, depth: 0 };
  return { text: line.slice(m[0].length), depth: (m[0].match(/>/g) ?? []).length };
}
/** Strip exactly `depth` blockquote markers (a fence's body lines). */
function unquoteN(line: string, depth: number): string {
  let s = line;
  for (let d = 0; d < depth; d++) {
    const m = /^[ \t]{0,3}>[ \t]?/.exec(s);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  return s;
}

/** Is an info string read as scrml? Untagged, or its first token starts `scrml` (`scrml`, `scrml{.example}`,
 *  `scrml,ignore` — #2101 r2 MED-2). */
export const readsInfo = (info: string) => info === "" || info.toLowerCase().startsWith("scrml");

/**
 * Every fence of a markdown text that is read: tagged `scrml…` or UNTAGGED (#2101 r1 HIGH-1), including a
 * fence inside a blockquote (`> ```scrml`, #2101 r2 MED-2) — its `>` markers are stripped, line numbers kept.
 * `negIds`: the row ids of `<!-- retired-neg: <id> — reason -->` markers on the lines directly above the
 * opener. `migration`: the fence lies in one of `regions` (only the SPEC is given any).
 */
export function readFences(md: string, regions: Region[] = []): Fence[] {
  const lines = md.split("\n");
  const out: Fence[] = [];
  let region: { level: number; children: RegExp } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) {
      const level = h[1].length;
      if (region && (level <= region.level || !region.children.test(h[2]))) region = null;
      if (!region) {
        const r = regions.find((x) => x.heading === lines[i].trimEnd());
        if (r) region = { level, children: new RegExp(r.children) };
      }
      continue;
    }
    const q = unquote(lines[i]);
    const f = /^(\s*)(```+|~~~+)\s*([^\s`]*)/.exec(q.text);
    if (!f) continue;
    const tok = f[2];
    const info = f[3].toLowerCase();
    const body = (k: number) => unquoteN(lines[k], q.depth);
    let j = i + 1;
    for (; j < lines.length && !(body(j).trimStart().startsWith(tok) && body(j).trim().replace(/[`~]/g, "") === ""); j++) {}
    if (readsInfo(info)) {
      const negIds = new Set<string>();
      for (let k = i - 1; k >= 0; k--) {
        const m = /^\s*<!--\s*retired-neg:\s*([\w-]+)(?:\s+(?:—|--|-)|\s*:)\s*[^\s>-][^>]*-->\s*$/.exec(unquote(lines[k]).text);
        if (!m) break;
        negIds.add(m[1]);
      }
      const text: string[] = [];
      for (let k = i + 1; k < j; k++) text.push(body(k));
      out.push({ startLine: i + 2, text: text.join("\n"), negIds, migration: region !== null, info });
    }
    i = j;
  }
  return out;
}

/** The SPEC's migration-region headings must each stand exactly once (#2101 r2 MED-1). */
export function regionErrors(md: string, regions: Region[]): string[] {
  const lines = md.split("\n").map((l) => l.trimEnd());
  const errs: string[] = [];
  for (const r of regions) {
    const n = lines.filter((l) => l === r.heading).length;
    if (n !== 1) errs.push(`migration region heading ${JSON.stringify(r.heading)} stands ${n} times in ${SPEC_PATH} (must be exactly once)`);
  }
  return errs;
}

export function scan(root: string, ledger: Ledger): Hit[] {
  const rows = ledger.rows.filter((r) => r.detector);
  const hits: Hit[] = [];
  const cache = new Map<string, Case | null>();
  for (const rel of scrmlFiles(root)) {
    const raw = readFileSync(join(root, rel), "utf8");
    const rawLines = raw.split("\n");
    const c0 = caseOf(root, rel, cache);
    const c = c0 && caseOwns(c0, rel) ? c0 : null;
    const found: { row: Row; ln: number }[] = [];
    for (const row of rows) {
      for (const ln of rowLines(row, raw, root)) {
        if (markerAllows(raw, ln, row.id, root)) continue;
        found.push({ row, ln });
      }
    }
    found.sort((a, b) => a.ln - b.ln);
    for (const { row, ln } of found) {
      // a negative case allows a hit only while one of its expected codes for this row has budget left
      // (#2101 r2 LOW-6: per expected occurrence; rows sharing a code share its budget)
      const code = c ? caseCodesFor(row, c).find((k) => (c.budget.get(k) ?? 0) > 0) : undefined;
      if (c && code) { c.budget.set(code, c.budget.get(code)! - 1); continue; }
      hits.push({ row: row.id, file: rel, line: ln, text: (rawLines[ln - 1] ?? "").trim().slice(0, 160) });
    }
  }
  for (const rel of mdFiles(root)) {
    const md = readFileSync(join(root, rel), "utf8");
    const mdLines = md.split("\n");
    for (const f of readFences(md, rel === SPEC_PATH ? ledger.migrationRegions ?? [] : [])) {
      if (f.migration) continue;
      for (const row of rows) {
        if (f.negIds.has(row.id)) continue;
        for (const ln of rowLines(row, f.text, root)) {
          if (markerAllows(f.text, ln, row.id, root)) continue;
          const fileLine = f.startLine + ln - 1;
          hits.push({ row: row.id, file: rel, line: fileLine, text: (mdLines[fileLine - 1] ?? "").trim().slice(0, 160) });
        }
      }
    }
  }
  return hits;
}

// --------------------------------------------------------------------------------------------------
// the check
// --------------------------------------------------------------------------------------------------

export type RowReport = { id: string; tier: string; hits: number; baseline: number; pending: number; rises: string[]; drops: string[]; newHard: string[] };

export function counts(hits: Hit[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const h of hits) {
    if (!m.has(h.row)) m.set(h.row, new Map());
    const f = m.get(h.row)!;
    f.set(h.file, (f.get(h.file) ?? 0) + 1);
  }
  return m;
}

/** Every (row, file) count must equal its baseline: above fails, below fails until lowered (#2101 r1 HIGH-3). */
export function check(ledger: Ledger, hits: Hit[], base: Baseline): { ok: boolean; rows: RowReport[] } {
  const c = counts(hits);
  const rows: RowReport[] = [];
  let ok = true;
  for (const row of ledger.rows) {
    if (!row.detector) continue;
    const now = c.get(row.id) ?? new Map<string, number>();
    const allowed: Record<string, number> = row.tier === "SOFT" ? base.soft?.[row.id] ?? {} : base.pending?.[row.id]?.files ?? {};
    const rep: RowReport = { id: row.id, tier: row.tier, hits: 0, baseline: 0, pending: 0, rises: [], drops: [], newHard: [] };
    for (const [f, n] of now) {
      rep.hits += n;
      const a = allowed[f] ?? 0;
      if (n > a) {
        ok = false;
        if (row.tier === "HARD" && a === 0) rep.newHard.push(`${f} (${n})`);
        else rep.rises.push(`${f}: ${a} -> ${n}`);
      }
    }
    for (const [f, a] of Object.entries(allowed)) {
      if (row.tier === "SOFT") rep.baseline += a; else rep.pending += a;
      const n = now.get(f) ?? 0;
      if (n < a) { rep.drops.push(`${f}: ${a} -> ${n}`); ok = false; }
    }
    rows.push(rep);
  }
  return { ok, rows };
}

/**
 * The baseline / ledger against a base revision's (#2101 r1 HIGH-3) — the PR cannot certify its own
 * baseline. `baseLedger` / `baseBaseline` null: the base has no gate yet (the PR that introduces it).
 */
export function checkAgainstBase(ledger: Ledger, base: Baseline, baseLedger: Ledger | null, baseBaseline: Baseline | null): string[] {
  const errs: string[] = [];
  if (baseLedger) {
    for (const br of baseLedger.rows) {
      const r = ledger.rows.find((x) => x.id === br.id);
      if (!r) { errs.push(`ledger row ${br.id} was removed (a retirement is never un-recorded)`); continue; }
      if (br.tier === "HARD" && r.tier === "SOFT") errs.push(`ledger row ${br.id} was downgraded HARD -> SOFT`);
      if (br.detector && !r.detector) errs.push(`ledger row ${br.id}'s detector was set to null`);
    }
  }
  if (!baseBaseline) return errs;
  const inBaseLedger = (id: string) => !baseLedger || baseLedger.rows.some((r) => r.id === id);
  for (const [id, files] of Object.entries(base.soft ?? {})) {
    const was = baseBaseline.soft?.[id];
    for (const [f, n] of Object.entries(files)) {
      if (!was && !inBaseLedger(id)) continue;     // a new SOFT row records its starting count
      const b = was?.[f];
      if (b === undefined) errs.push(`SOFT ${id}: ${f} is a new baseline key (${n}) — the base has none`);
      else if (n > b) errs.push(`SOFT ${id}: ${f} baseline raised ${b} -> ${n}`);
    }
  }
  for (const [id, p] of Object.entries(base.pending ?? {})) {
    const was = baseBaseline.pending?.[id];
    if (!was) {
      errs.push(inBaseLedger(id)
        ? `HARD ${id}: new pending debt — the base has none for this row`
        : `HARD ${id}: a new HARD row brings no pending debt — migrate its hits (or mark each one)`);
      continue;
    }
    for (const [f, n] of Object.entries(p.files)) {
      const b = was.files[f];
      if (b === undefined) errs.push(`HARD ${id}: ${f} is a new pending key (${n}) — the base has none`);
      else if (n > b) errs.push(`HARD ${id}: ${f} pending raised ${b} -> ${n}`);
    }
  }
  return errs;
}

/**
 * The BASE ledger's rules over the HEAD tree (#2101 r2 MED-3): every base row — its detector, codes and
 * caseIdPattern — and the base's migration regions, scanned over this tree, must find no (row, file) count
 * above the base baseline. So a change that loosens what a row allows (a code added to `codes`, a widened
 * `caseIdPattern`, a detector replaced by a narrower or never-matching one, a new migration region) cannot
 * hide a new hit: the base rule still sees it. Drops are fine here (a migration lowers counts). The readers
 * and builtin detectors are this tree's script (a change to them is a reviewed code diff).
 */
export function baseRulesOnHead(root: string, baseLedger: Ledger, baseBaseline: Baseline, headRegions: Region[] = []): string[] {
  let hits: Hit[];
  // a base that predates `migrationRegions` (#2101 before r2) is read with this tree's regions
  const L: Ledger = baseLedger.migrationRegions ? baseLedger : { ...baseLedger, migrationRegions: headRegions };
  try { hits = scan(root, L); }
  catch (e) { return [`the base ledger's rules cannot be run over this tree: ${(e as Error).message}`]; }
  const errs: string[] = [];
  const c = counts(hits);
  for (const row of baseLedger.rows) {
    if (!row.detector) continue;
    const allowed: Record<string, number> = row.tier === "SOFT" ? baseBaseline.soft?.[row.id] ?? {} : baseBaseline.pending?.[row.id]?.files ?? {};
    for (const [f, n] of c.get(row.id) ?? new Map<string, number>()) {
      const a = allowed[f] ?? 0;
      if (n > a) errs.push(`base rule ${row.id} (${row.tier}) finds ${n} hit(s) in ${f}, the base baseline allows ${a} (a loosened ledger row or region cannot hide it)`);
    }
  }
  return errs;
}

/** The baseline lowered to the current counts — never raised (a rise still fails the check). */
export function lowered(ledger: Ledger, hits: Hit[], base: Baseline): Baseline {
  const c = counts(hits);
  const out: Baseline = { $comment: base.$comment, soft: {}, pending: {} };
  for (const row of ledger.rows) {
    const now = c.get(row.id) ?? new Map<string, number>();
    const src = row.tier === "SOFT" ? base.soft?.[row.id] : base.pending?.[row.id]?.files;
    if (!src) continue;
    const files: Record<string, number> = {};
    for (const [f, a] of Object.entries(src).sort()) {
      const n = Math.min(a, now.get(f) ?? 0);
      if (n > 0) files[f] = n;
    }
    if (row.tier === "SOFT") { if (Object.keys(files).length) out.soft[row.id] = files; }
    else if (Object.keys(files).length) out.pending[row.id] = { since: base.pending[row.id].since, why: base.pending[row.id].why, files };
  }
  return out;
}

/** A file at a git revision, or null when the revision lacks it. */
function gitShow(root: string, rev: string, path: string): string | null {
  const r = spawnSync("git", ["show", `${rev}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0) return r.stdout;
  const v = spawnSync("git", ["rev-parse", "--verify", "-q", `${rev}^{commit}`], { cwd: root, encoding: "utf8" });
  if (v.status !== 0) throw new Error(`retired-forms-lint: --base-ref ${rev} does not resolve`);
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (f: string) => argv.includes(f);
  const arg = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(arg("--root") ?? SCRIPT_ROOT);
  const t0 = performance.now();
  const ledger: Ledger = JSON.parse(readFileSync(resolve(arg("--ledger") ?? join(root, LEDGER_PATH)), "utf8"));
  const hits = scan(root, ledger);
  const list = arg("--list");
  if (list) {
    for (const h of hits.filter((x) => x.row === list)) console.log(`${h.file}:${h.line}: ${h.text}`);
    return 0;
  }
  const bpath = resolve(arg("--baseline") ?? join(root, BASELINE_PATH));
  if (flag("--init")) {
    if (existsSync(bpath)) { console.error("retired-forms-lint: --init refused, the baseline exists (use --update, which only lowers it)"); return 2; }
    console.error("retired-forms-lint: --init writes every current count; edit `pending` reasons before committing");
    const c = counts(hits);
    const b: Baseline = { soft: {}, pending: {} };
    for (const row of ledger.rows) {
      const m = c.get(row.id);
      if (!m) continue;
      const files = Object.fromEntries([...m].sort());
      if (row.tier === "SOFT") b.soft[row.id] = files;
      else b.pending[row.id] = { since: new Date().toISOString().slice(0, 10), why: "TODO", files };
    }
    writeFileSync(bpath, JSON.stringify(b, null, 2) + "\n");
    return 0;
  }
  let base: Baseline = existsSync(bpath) ? JSON.parse(readFileSync(bpath, "utf8")) : { soft: {}, pending: {} };
  if (flag("--update")) {
    base = lowered(ledger, hits, base);
    writeFileSync(bpath, JSON.stringify(base, null, 2) + "\n");
    console.error(`retired-forms-lint: baseline lowered to the current counts (${relative(root, bpath)})`);
  }
  const res = check(ledger, hits, base);
  const specAbs = join(root, SPEC_PATH);
  const regErrs = existsSync(specAbs) ? regionErrors(readFileSync(specAbs, "utf8"), ledger.migrationRegions ?? []) : [];
  if (regErrs.length) res.ok = false;
  // --base-ref: the baseline and the ledger may not be loosened in the same change (HIGH-3)
  const baseRef = arg("--base-ref");
  let baseErrs: string[] = [];
  let baseNote = "";
  if (baseRef) {
    const v = spawnSync("git", ["rev-parse", "--verify", "-q", `${baseRef}^{commit}`], { cwd: root, encoding: "utf8" });
    if (v.status !== 0) {
      console.error(`retired-forms-lint: --base-ref ${baseRef} does not resolve to a commit in ${root} (fetch it, or pass another revision)`);
      return 2;
    }
    const bl = gitShow(root, baseRef, LEDGER_PATH);
    const bb = gitShow(root, baseRef, BASELINE_PATH);
    if (bb === null && existsSync(bpath) && bl !== null) baseErrs.push(`${baseRef} has the ledger but no baseline — refusing`);
    if (bb !== null && !existsSync(bpath)) baseErrs.push(`the baseline ${BASELINE_PATH} was deleted`);
    const baseLedger: Ledger | null = bl ? JSON.parse(bl) : null;
    const baseBaseline: Baseline | null = bb ? JSON.parse(bb) : null;
    baseErrs = baseErrs.concat(checkAgainstBase(ledger, base, baseLedger, baseBaseline));
    if (baseLedger && baseBaseline) baseErrs = baseErrs.concat(baseRulesOnHead(root, baseLedger, baseBaseline, ledger.migrationRegions ?? []));
    if (bb === null && bl === null) baseNote = ` (base ${baseRef} has no gate yet: this change introduces it)`;
  }
  const ok = res.ok && baseErrs.length === 0;
  const ms = Math.round(performance.now() - t0);
  if (flag("--json")) {
    console.log(JSON.stringify({ ok, ms, rows: res.rows, regErrs, baseErrs, hits }, null, 2));
    return ok ? 0 : 1;
  }
  if (flag("--quiet") && ok) {
    const debt = Object.values(base.pending ?? {}).reduce((a, p) => a + Object.values(p.files).reduce((x, y) => x + y, 0), 0);
    console.log(`retired-forms-lint: OK (${hits.length} hits; pending HARD debt ${debt}; ${ms} ms${baseRef ? `; baseline checked against ${baseRef}${baseNote}` : ""})`);
    return 0;
  }
  console.log(`retired-forms-lint — ${ledger.rows.length} ledger rows (${ledger.rows.filter((r) => !r.detector).length} compiler-enforced only), ${hits.length} hits, ${ms} ms`);
  console.log("  row                          tier  hits  soft-baseline  pending-debt");
  for (const r of res.rows) {
    if (r.hits === 0 && r.baseline === 0 && r.pending === 0) continue;
    console.log(`  ${r.id.padEnd(28)} ${r.tier.padEnd(5)} ${String(r.hits).padStart(4)}  ${String(r.baseline).padStart(13)}  ${String(r.pending).padStart(12)}`);
  }
  const debt = Object.entries(base.pending ?? {});
  if (debt.length) {
    console.log("\n  PENDING HARD DEBT (dated; may only shrink):");
    for (const [id, p] of debt) {
      const n = Object.values(p.files).reduce((a, b) => a + b, 0);
      console.log(`    ${id} — ${n} hit(s) in ${Object.keys(p.files).length} file(s), since ${p.since}: ${p.why}`);
    }
  }
  if (!ok) {
    console.error("\n✗ retired-forms-lint FAILED");
    for (const r of res.rows) {
      const lr = ledger.rows.find((x) => x.id === r.id)!;
      for (const f of r.newHard) console.error(`  HARD ${r.id}: ${f} — a retired form (${lr.old}); write ${lr.new}`);
      for (const f of r.rises) console.error(`  ${r.tier} ${r.id}: count rose — ${f}`);
      for (const f of r.drops) console.error(`  ${r.tier} ${r.id}: count fell — ${f}; lower the baseline: bun scripts/retired-forms-lint.ts --update`);
    }
    for (const e of regErrs) console.error(`  REGION: ${e}`);
    for (const e of baseErrs) console.error(`  BASELINE vs ${baseRef}: ${e}`);
    console.error("  List a row's hits: bun scripts/retired-forms-lint.ts --list <row-id>. A deliberate negative in markdown takes");
    console.error("  `<!-- retired-neg: <row-id> — reason -->` directly above its fence; in source, `// retired-ok: <row-id> — reason`");
    console.error("  in a comment on the line (or the line before).");
    return 1;
  }
  console.log(`\n✓ retired-forms-lint: every (row, file) count equals its baseline${baseRef ? `; baseline checked against ${baseRef}${baseNote}` : ""}`);
  return 0;
}

if (import.meta.main) process.exit(main());
