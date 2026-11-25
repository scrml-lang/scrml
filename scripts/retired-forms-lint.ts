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
 *        - .scrml files under SCRML_ROOTS;
 *        - in MD_FILES / MD_ROOTS / every README.md outside EXCLUDED: every fence tagged `scrml` AND every
 *          UNTAGGED fence (``` with no info string). Fences tagged another language (js, html, css, sql,
 *          json, toml, ebnf, …) and markdown prose are not read.
 *      Source is read by one source-order walker (scripts/retired-forms-walk.ts, a port of the bootstrap's
 *      readers): comments, strings, raw bodies (`<pre>` `<code>` `<script>` `<style>`), foreign / SQL /
 *      CSS bodies and the free text of a closed HTML element are never matched. Regex detectors match
 *      over the WHOLE text (a line break is whitespace) and every match is one hit.
 *   2. ALLOWS a hit only when:
 *        - its conformance / acceptance case is a NEGATIVE for that row: the case's expected.json
 *          `expect.codes` (or `codeCounts`) names one of the row's codes, and — for a row whose codes are
 *          generic (`caseIdPattern` set: E-SCOPE-001, E-PARSE-FN, E-PARSE-TYPE, E-GRANT-UNKNOWN) — the
 *          case's id also matches the row's `caseIdPattern`;
 *        - a markdown fence is marked as a negative by `<!-- retired-neg: <row-id> — <reason> -->` on the
 *          line(s) directly above its opener (one marker per row; consecutive marker lines stack);
 *        - the fence lies in a SPEC migration region: a heading `Appendix E…`, `63 …` / `63.…` (the §63
 *          lifecycle) or `66.21 …`, through every deeper heading, to the next heading of its level or
 *          higher;
 *        - `retired-ok: <row-id> — <reason>` stands in a COMMENT (`//`, `/* *\/`, `<!-- -->`) on the hit's
 *          line or the line before it (exact id, a non-empty reason).
 *      A code named in prose or in a comment allows nothing.
 *   3. COUNTS: every (row, file) count must EQUAL the baseline (scripts/retired-forms-baseline.json):
 *        - a HARD hit with no `pending` entry fails; a count above the baseline fails;
 *        - a count BELOW the baseline also fails until the baseline is lowered (`--update`), so slack is
 *          never left for a later PR to spend.
 *   4. With `--base-ref <rev>` (CI: the PR's base; the pre-commit hook: the merge-base with origin/main)
 *      the baseline and ledger themselves are checked against that revision's:
 *        - no (row, file) count above the base's, no (row, file) key the base lacks — except a SOFT row the
 *          base ledger lacks (a new deprecation records its starting count); a new HARD row brings no debt;
 *        - no ledger row removed, none downgraded HARD -> SOFT, no detector set to null.
 *
 * KNOWN LIMITS (also in SPEC §63):
 *   - counts are per (row, file): removing one hit and adding another of the same row in the same file
 *     passes (a swap);
 *   - a detector's regex can be narrowed in a PR (a removed row, a tier downgrade or a nulled detector
 *     fail under --base-ref; a narrowed pattern is a reviewed diff of compiler/retired-forms.json);
 *   - text cannot tell a tape from a host array (tape-js-method) or a cell from an element (render-by-tag,
 *     detector null); rows with `enforcedBy: "lint-only"` have no compiler refusal, the lint alone holds
 *     them;
 *   - a fence tagged as another language, and markdown prose, are not read;
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
export type Ledger = { rows: Row[] };
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
export const MD_FILES = ["compiler/SPEC.md", "NERDME.md", "DESIGN.md"];
export const MD_ROOTS = ["docs"];
/**
 * Markdown NOT read, each with its reason (#2101 r1 MED-4: everything public is read except these).
 * A path is excluded when it equals an entry or lies under one.
 */
export const EXCLUDED: Record<string, string> = {
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
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "archive"]);

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
    if (SKIP_DIRS.has(e) || e.startsWith(".")) continue;
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
  for (const f of MD_FILES) if (existsSync(join(root, f))) out.push(f);
  for (const r of MD_ROOTS) walk(root, r, (f) => f.endsWith(".md"), out);
  walk(root, "", (f) => f.endsWith("/README.md") || f === "README.md", out);
  return [...new Set(out)].sort();
}

/** The conformance / acceptance case holding `rel`: its id and expected codes, or null. */
function caseOf(root: string, rel: string, cache: Map<string, { id: string; codes: string[] } | null>) {
  if (!rel.startsWith("conformance/cases/") && !rel.startsWith("compiler/self-host-v2/acceptance/")) return null;
  for (let dir = dirname(rel); dir.includes("/"); dir = dirname(dir)) {
    if (cache.has(dir)) return cache.get(dir)!;
    const p = join(root, dir, "expected.json");
    if (existsSync(p)) {
      let c: { id: string; codes: string[] } | null = null;
      try {
        const ex = JSON.parse(readFileSync(p, "utf8"));
        c = { id: String(ex?.id ?? dir.split("/").pop()), codes: [...(ex?.expect?.codes ?? []), ...Object.keys(ex?.expect?.codeCounts ?? {})] };
      } catch { c = null; }
      cache.set(dir, c);
      return c;
    }
  }
  return null;
}

/** Is the case a labelled negative for `row` (#2101 r1 HIGH-2)? Its expected codes name one of the row's
 *  codes, and a generic-code row's `caseIdPattern` matches the case id. */
export function caseIsNegativeFor(row: Row, c: { id: string; codes: string[] } | null): boolean {
  if (!c || !row.codes.some((code) => c.codes.includes(code))) return false;
  if (row.caseIdPattern) return new RegExp(row.caseIdPattern).test(c.id);
  return true;
}

export type Fence = { startLine: number; text: string; negIds: Set<string>; migration: boolean; info: string };

/** A SPEC migration-region heading (Appendix E, §63, §66.21). */
export function migrationHeading(heading: string): boolean {
  return /^Appendix E\b/i.test(heading) || /^63(\.|\s)/.test(heading) || /^66\.21\b/.test(heading);
}

/**
 * Every fence of a markdown text that is read: tagged `scrml` or UNTAGGED (#2101 r1 HIGH-1). `negIds`: the
 * row ids of `<!-- retired-neg: <id> — reason -->` markers on the lines directly above the opener.
 * `migration`: the fence lies in a migration region (only meaningful for the SPEC).
 */
export function readFences(md: string): Fence[] {
  const lines = md.split("\n");
  const out: Fence[] = [];
  let region: number | null = null;     // the heading level that opened the current migration region
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) {
      const level = h[1].length;
      if (region !== null && level <= region) region = null;
      if (region === null && migrationHeading(h[2])) region = level;
      continue;
    }
    const f = /^(\s*)(```+|~~~+)\s*([^\s`]*)/.exec(lines[i]);
    if (!f) continue;
    const tok = f[2];
    const info = f[3].toLowerCase();
    let j = i + 1;
    for (; j < lines.length && !(lines[j].trimStart().startsWith(tok) && lines[j].trim().replace(/[`~]/g, "") === ""); j++) {}
    if (info === "" || info === "scrml") {
      const negIds = new Set<string>();
      for (let k = i - 1; k >= 0; k--) {
        const m = /^\s*<!--\s*retired-neg:\s*([\w-]+)(?:\s+(?:—|--|-)|\s*:)\s*[^\s>-][^>]*-->\s*$/.exec(lines[k]);
        if (!m) break;
        negIds.add(m[1]);
      }
      out.push({ startLine: i + 2, text: lines.slice(i + 1, j).join("\n"), negIds, migration: region !== null, info });
    }
    i = j;
  }
  return out;
}

export function scan(root: string, ledger: Ledger): Hit[] {
  const rows = ledger.rows.filter((r) => r.detector);
  const hits: Hit[] = [];
  const cache = new Map<string, { id: string; codes: string[] } | null>();
  for (const rel of scrmlFiles(root)) {
    const raw = readFileSync(join(root, rel), "utf8");
    const rawLines = raw.split("\n");
    const c = caseOf(root, rel, cache);
    for (const row of rows) {
      if (caseIsNegativeFor(row, c)) continue;
      for (const ln of rowLines(row, raw, root)) {
        if (markerAllows(raw, ln, row.id, root)) continue;
        hits.push({ row: row.id, file: rel, line: ln, text: (rawLines[ln - 1] ?? "").trim().slice(0, 160) });
      }
    }
  }
  for (const rel of mdFiles(root)) {
    const md = readFileSync(join(root, rel), "utf8");
    const mdLines = md.split("\n");
    for (const f of readFences(md)) {
      if (rel === "compiler/SPEC.md" && f.migration) continue;
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
  // --base-ref: the baseline and the ledger may not be loosened in the same change (HIGH-3)
  const baseRef = arg("--base-ref");
  let baseErrs: string[] = [];
  let baseNote = "";
  if (baseRef) {
    const bl = gitShow(root, baseRef, LEDGER_PATH);
    const bb = gitShow(root, baseRef, BASELINE_PATH);
    if (bb === null && existsSync(bpath) && bl !== null) baseErrs.push(`${baseRef} has the ledger but no baseline — refusing`);
    if (bb !== null && !existsSync(bpath)) baseErrs.push(`the baseline ${BASELINE_PATH} was deleted`);
    baseErrs = baseErrs.concat(checkAgainstBase(ledger, base, bl ? JSON.parse(bl) : null, bb ? JSON.parse(bb) : null));
    if (bb === null && bl === null) baseNote = ` (base ${baseRef} has no gate yet: this change introduces it)`;
  }
  const ok = res.ok && baseErrs.length === 0;
  const ms = Math.round(performance.now() - t0);
  if (flag("--json")) {
    console.log(JSON.stringify({ ok, ms, rows: res.rows, baseErrs, hits }, null, 2));
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
