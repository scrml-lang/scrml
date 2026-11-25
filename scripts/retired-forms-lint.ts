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
 *   1. READS every ledger row with a detector (compiler/retired-forms.json) over the ledger's `corpus` (#2101
 *      r3 F5: the file set is ledger data, so --base-ref checks it like the rows):
 *        - .scrml files under `corpus.scrmlRoots`, minus `corpus.excluded` / `corpus.skipDirs`;
 *        - every .md file of the tree minus `corpus.excluded` (each with its reason) and `corpus.skipDirs` /
 *          dot-directories: every fenced code block as CommonMark (GFM) reads it — `marked`'s lexer (#2101 r3
 *          F1/F3), never a hand parser, cross-checked by commonmark.js (#2101 r5: a read-fence disagreement exits 2) — whose info string is empty, STARTS `scrml` (`scrml{.example}`,
 *          `scrml,ignore`) or is an attribute block with the class `.scrml` (`{.scrml}`); fences in
 *          blockquotes and list items included, each ending where CommonMark ends it. Fences tagged another
 *          language, indented code blocks, HTML `<pre>` blocks and prose are not read.
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
 *          line(s) directly above its opener, at the opener's blockquote depth (one marker per row;
 *          consecutive marker lines stack); each fence's line is marked's own token position (#2101 r4 F1);
 *        - no region of any file is exempt (#2101 r4 F2: SPEC "migration regions" are retired; a ledger that
 *          still lists `migrationRegions` fails);
 *        - `retired-ok: <row-id> — <reason>` stands in a COMMENT (`//`, `/* *\/`, `<!-- -->`) on the hit's
 *          line or the line before it (exact id, a non-empty reason).
 *      A code named in prose or in a comment allows nothing.
 *   3. COUNTS: every (row, file) count must EQUAL the baseline (scripts/retired-forms-baseline.json):
 *        - a HARD hit with no `pending` entry fails; a count above the baseline fails;
 *        - a count BELOW the baseline also fails until the baseline is lowered (`--update`), so slack is
 *          never left for a later PR to spend;
 *        - a markdown block that cannot be placed exactly on its source lines exits 2 (never read at a guess).
 *   4. With `--base-ref <rev>` (CI: the PR's base; the pre-commit hook: the merge-base with origin/main; an
 *      unresolvable rev exits 2) the baseline and ledger themselves are checked against that revision's:
 *        - no (row, file) count above the base's, no (row, file) key the base lacks — except a SOFT row the
 *          base ledger lacks (a new deprecation records its starting count); a new HARD row brings no debt;
 *        - no ledger row removed, none downgraded HARD -> SOFT, no detector set to null;
 *        - the BASE ledger's rules (each base row's detector / codes / caseIdPattern, the base corpus) run
 *          over this tree find no (row, file) count above the base baseline (#2101 r2 MED-3, r3 F5): a widened
 *          `codes` / `caseIdPattern`, a narrowed or never-matching detector, a newly excluded path cannot hide
 *          a hit.
 *
 * KNOWN LIMITS (also in SPEC §63):
 *   - counts are per (row, file): removing one hit and adding another of the same row in the same file
 *     passes (a swap); in a negative case, which hit its budget allows is not tied to a diagnostic's line;
 *   - the source walker, the markdown reader and the builtin detectors are this tree's script: narrowing them
 *     is a reviewed code diff the base rules do not catch; a base ledger older than `corpus` is read with
 *     this tree's;
 *   - text cannot tell a tape from a host array (tape-js-method) or a cell from an element (render-by-tag,
 *     detector null); rows with `enforcedBy: "lint-only"` have no compiler refusal, the lint alone holds
 *     them; tape-js-method sees no computed member (`xs["push"](1)`) and a discarded `.sort()` only after
 *     `;` / `{` / `}`;
 *   - a fence tagged as another language, an indented code block, an HTML `<pre>` block and prose are not
 *     read;
 *   - INTERIM (#2101 r5 HIGH-1): markdown marked 14 reads differently from CommonMark (a fence after a lazy
 *     continuation inside a list in a blockquote) exits 2 via the commonmark.js cross-check, asking the author to
 *     reshape valid CommonMark. The capable form: one reader that agrees with CommonMark — marked >= 18.0.0
 *     (2026-04-07) agrees on the r4 fuzz and the lazy reproducers, but the placement wrappers below hook marked
 *     internals and must be re-proven on it first (g-tool-retired-lint-marked-bump-s482);
 *   - a retired closer inside an unclosed raw body is raw text here (the bootstrap names it);
 *   - INTERIM: an unterminated string or template literal in a fence (a stray ``` line inside it opens one)
 *     hides the rest of that fence. The capable form: fail when a fence's text ends inside an unterminated
 *     string / template literal (the compiler refuses that source anyway), so nothing after it is unread;
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
import { dirname, join, relative, resolve, posix as posixPath } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Lexer } from "marked";
import { Parser as CommonmarkParser } from "commonmark";
import { analyze, view, K_CODE, K_COMMENT, type Analysis } from "./retired-forms-walk.ts";

export type Detector = { kind: "regex"; pattern: string; flags: string } | { kind: "builtin"; name: string } | null;
export type Row = {
  id: string; tier: "HARD" | "SOFT"; old: string; new: string; codes: string[]; spec: string; ruling: string;
  detector: Detector; keepStrings?: boolean; caseIdPattern?: string; enforcedBy?: string; note?: string;
};
export type Ledger = { rows: Row[]; corpus?: Corpus };
export type Hit = { row: string; file: string; line: number; text: string };
export type Baseline = {
  $comment?: string;
  soft: Record<string, Record<string, number>>;
  pending: Record<string, { since: string; why: string; files: Record<string, number> }>;
};

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LEDGER_PATH = "compiler/retired-forms.json";
export const BASELINE_PATH = "scripts/retired-forms-baseline.json";

/**
 * What the gate reads (#2101 r3 F5): the ledger's `corpus` — `scrmlRoots` (the `.scrml` roots), `excluded`
 * (paths not read, each with its reason; a path equal to an entry or under it) and `skipDirs` (directory names
 * skipped at any depth; every dot-directory — `.git`, `.github`, `.claude`, … — is skipped too). It lives in
 * the ledger, not in this script, so `--base-ref` runs the BASE's file set over the changed tree: a newly
 * excluded path that hides a hit fails.
 */
export type Corpus = { scrmlRoots: string[]; excluded: Record<string, string>; skipDirs: Record<string, string> };
export const SPEC_PATH = "compiler/SPEC.md";

/** The ledger's corpus, or an error (a ledger without one cannot say what it reads). */
export function corpusOf(ledger: Ledger): Corpus {
  const c = ledger.corpus;
  if (!c || !Array.isArray(c.scrmlRoots) || typeof c.excluded !== "object" || typeof c.skipDirs !== "object") {
    throw new Error("retired-forms-lint: the ledger has no `corpus` (scrmlRoots / excluded / skipDirs)");
  }
  return c;
}

/** A repo-relative path, always `/`-separated (#2101 r1 HIGH-4: keys and prefixes are posix on every OS). */
export const posix = (p: string) => p.replace(/\\/g, "/");
export const isExcluded = (corpus: Corpus, rel: string) => Object.keys(corpus.excluded).some((e) => rel === e || rel.startsWith(e + "/"));

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

function walk(root: string, corpus: Corpus, rel: string, test: (rel: string) => boolean, out: string[]) {
  rel = posix(rel);
  if (isExcluded(corpus, rel)) return;
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  if (statSync(abs).isFile()) { if (test(rel)) out.push(rel); return; }
  for (const e of readdirSync(abs).sort()) {
    if (Object.hasOwn(corpus.skipDirs, e) || e.startsWith(".")) continue;
    walk(root, corpus, rel === "" ? e : `${rel}/${e}`, test, out);
  }
}

export function scrmlFiles(root: string, corpus: Corpus): string[] {
  const out: string[] = [];
  for (const r of corpus.scrmlRoots) walk(root, corpus, r, (f) => f.endsWith(".scrml"), out);
  return [...new Set(out)].sort();
}

export function mdFiles(root: string, corpus: Corpus): string[] {
  const out: string[] = [];
  walk(root, corpus, "", (f) => f.endsWith(".md"), out);
  return [...new Set(out)].sort();
}

/**
 * A conformance / acceptance case: its id, its expected codes, `budget` — how many hits each expected code
 * may allow (#2101 r2 LOW-6: `codeCounts[code]`, else 1 for a code in `codes`; consumed across the case's
 * files, in file then source order) — and `files`, its OWN files relative to its directory (#2101 r3 NIT:
 * exact paths, never a substring): `case.scrml`, every file case.scrml imports (`from '<path>'` /
 * `import '<path>'` in code — not in a comment, a string or text), and every string value of expected.json that is a `.scrml` path.
 */
export type Case = { id: string; codes: string[]; dir: string; budget: Map<string, number>; files: Set<string> };

/** `spec` (an import specifier or a path) as a path relative to the case directory, or null when it leaves it. */
function caseRel(spec: string): string | null {
  const n = posixPath.normalize(spec.replace(/\\/g, "/"));
  if (n.startsWith("../") || n === ".." || n.startsWith("/")) return null;
  return n;
}

/** The case's own files (relative to its directory): case.scrml, its imports, expected.json's `.scrml` paths. */
function caseFiles(root: string, dir: string, expected: unknown): Set<string> {
  const files = new Set<string>(["case.scrml"]);
  const cs = join(root, dir, "case.scrml");
  if (existsSync(cs)) {
    const src = readFileSync(cs, "utf8");
    const an = read(src, root).an;
    for (const m of src.matchAll(/(?<![\w$.])(?:from|import)\s*(["'])([^"'\n]+?\.scrml)\1/g)) {
      if (an.kinds[m.index!] !== K_CODE) continue;     // an import in code, never one named in a comment or text
      const r = caseRel(m[2]);
      if (r) files.add(r);
    }
  }
  const strings = (v: unknown) => {
    if (typeof v === "string") { if (/\.scrml$/.test(v) && !/\s/.test(v)) { const r = caseRel(v); if (r) files.add(r); } }
    else if (Array.isArray(v)) v.forEach(strings);
    else if (v && typeof v === "object") Object.values(v).forEach(strings);
  };
  strings(expected);
  return files;
}

/** The conformance / acceptance case holding `rel`, or null. */
function caseOf(root: string, rel: string, cache: Map<string, Case | null>): Case | null {
  if (!rel.startsWith("conformance/cases/") && !rel.startsWith("compiler/self-host-v2/acceptance/")) return null;
  for (let dir = dirname(rel); dir.includes("/"); dir = dirname(dir)) {
    if (cache.has(dir)) return cache.get(dir)!;
    const p = join(root, dir, "expected.json");
    if (existsSync(p)) {
      let c: Case | null = null;
      try {
        const ex = JSON.parse(readFileSync(p, "utf8"));
        const cc: Record<string, number> = ex?.expect?.codeCounts ?? {};
        const codes: string[] = [...(ex?.expect?.codes ?? []), ...Object.keys(cc)];
        const budget = new Map<string, number>();
        for (const code of codes) budget.set(code, typeof cc[code] === "number" ? cc[code] : 1);
        c = { id: String(ex?.id ?? dir.split("/").pop()), codes, dir, budget, files: caseFiles(root, dir, ex) };
      } catch { c = null; }
      cache.set(dir, c);
      return c;
    }
  }
  return null;
}

/** Is `rel` one of the case's own files (an exact path — #2101 r3 NIT)? A helper the case never imports is not. */
export function caseOwns(c: Case, rel: string): boolean {
  return c.files.has(rel.slice(c.dir.length + 1));
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

export type Fence = { startLine: number; text: string; negIds: Set<string>; info: string };

/** A line's blockquote prefix (`> `, `> > `, `>   `) stripped, and how many `>` it held. */
function unquote(line: string): { text: string; depth: number } {
  const m = /^(?:[ \t]{0,3}>[ \t]?)+/.exec(line);
  if (!m) return { text: line, depth: 0 };
  return { text: line.slice(m[0].length), depth: (m[0].match(/>/g) ?? []).length };
}

/** A line with its container prefixes — blockquote markers and list markers — removed, and leading space. */
function containerless(line: string): string {
  let s = line;
  for (;;) {
    const t = s.replace(/^[ \t]*>[ \t]?/, "").replace(/^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/, "");
    if (t === s) return s.trimStart();
    s = t;
  }
}

/** A code line compared across containers: blockquote markers and indentation are not content here. */
const bodyKey = (l: string) => l.replace(/^[\s>]*/, "").trimEnd();

/** Is an info string read as scrml (#2101 r2 MED-2, r3 F3)? Untagged, its first token starts `scrml`
 *  (`scrml`, `scrml{.example}`, `scrml,ignore`), or a pandoc attribute block with the class `.scrml`
 *  (`{.scrml}`, `{.scrml .numberLines}`). */
export const readsInfo = (info: string) => {
  const i = info.trim().toLowerCase();
  return i === "" || i.startsWith("scrml") || /^\{\s*(?:[^}]*\s)?\.scrml(?![\w-])/.test(i);
};

type MdCode = { open: number; text: string; info: string; depth: number };
type MdHeading = { line: number; level: number; top: boolean };

/** A markdown block the gate cannot place exactly on its source lines (#2101 r4): the gate exits 2, it never
 *  reads a block at a guessed line. */
export class PlacementError extends Error {}

/** One `blockTokens` call of marked's lexer: the text it lexed (the whole file, a blockquote segment with its
 *  `>` markers stripped, or a list item's de-indented text — each maps line for line onto its source lines). */
type Frame = { src: string; nl?: Int32Array };
/** Where a token starts: its frame and its offset in the frame's text (exact — marked's own position). */
type At = { frame: Frame; off: number } | null;

/** Newlines in `s` before offset `off`. */
function nlBefore(s: string, off: number): number {
  let n = 0;
  for (let i = s.indexOf("\n"); i >= 0 && i < off; i = s.indexOf("\n", i + 1)) n++;
  return n;
}
function frameLine(f: Frame, off: number): number {
  if (!f.nl) {
    const at: number[] = [];
    for (let i = f.src.indexOf("\n"); i >= 0; i = f.src.indexOf("\n", i + 1)) at.push(i);
    f.nl = Int32Array.from(at);
  }
  let lo = 0, hi = f.nl.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (f.nl[m] < off) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * marked's tokens, each fence / heading / blockquote / list tagged with its exact source position (#2101 r4
 * F1): every `blockTokens` call is a frame, and a tokenizer called from a frame starts at offset
 * `frame.length - remaining.length` — marked's own cursor, not a text search. A blockquote / list records the
 * frames its children were lexed in. A container marked re-reads with its lazy continuation (a blockquote's
 * nested blockquote / list) keeps the position of the token it replaces.
 */
function lexPlaced(md: string): { tokens: any[]; top: Frame } {
  const lexer: any = new Lexer({ gfm: true });
  const tk: any = lexer.tokenizer;
  const stack: (Frame | "tk")[] = [];
  const ctxs: Frame[][] = [];
  let top: Frame | null = null;
  let last: any = null;
  const blockTokens = lexer.blockTokens.bind(lexer);
  lexer.blockTokens = (src: string, tokens?: any[], clipped?: boolean) => {
    const frame: Frame = { src };
    if (ctxs.length) ctxs[ctxs.length - 1].push(frame); else if (!top) top = frame;
    stack.push(frame);
    try { return blockTokens(src, tokens, clipped); } finally { stack.pop(); }
  };
  for (const name of ["fences", "heading", "lheading", "blockquote", "list"]) {
    const orig = tk[name];
    const container = name === "blockquote" || name === "list";
    tk[name] = function (src: string) {
      const caller = stack[stack.length - 1];
      const prev = last;                       // the token a re-read replaces (tagged before this call)
      const frames: Frame[] = [];
      if (container) ctxs.push(frames);
      stack.push("tk");
      let t: any;
      try { t = orig.call(this, src); } finally { stack.pop(); if (container) ctxs.pop(); }
      if (!t) return t;
      let at: At = null;
      if (caller && caller !== "tk") at = { frame: caller, off: caller.src.length - src.length };
      else if (prev?.__at && src.startsWith(prev.raw)) at = prev.__at;     // a re-read: same start as the token it replaces
      t.__at = at;
      t.__len = t.raw.length;                  // marked may later append a spacer `\n` to raw
      if (container) t.__frames = frames;
      last = t;
      return t;
    };
  }
  const tokens = lexer.lex(md);
  if (!top) throw new PlacementError("marked lexed no frame");
  return { tokens, top };
}

/**
 * The fenced code blocks and headings of a markdown text (`\n` line ends — callers normalise `\r\n` / `\r`, as
 * marked does), as CommonMark (GFM) reads them — `marked`'s lexer (#2101 r3 F1/F3). A fence inside a
 * blockquote, a list item (`- ```scrml` on the bullet line) or both is read with its container; an indented
 * "closer" inside a fence is content. Each block's line comes from marked's own token positions (#2101 r4 F1:
 * never a forward text search, which an identical decoy — an indented block, an HTML block — could capture):
 * a top-level token's line is its offset in the file; a blockquote child's is the blockquote's line plus the
 * child's line in the blockquote's text; a list item's is the list's line plus the item's line in the list's
 * raw. The placed line is then checked against the source (the opener there is a fence opener and every body
 * line follows; a heading's line is that heading); a block that cannot be placed exactly throws
 * `PlacementError`.
 */
export function mdBlocks(md: string): { codes: MdCode[]; headings: MdHeading[] } {
  const lines = md.split("\n");
  const codes: MdCode[] = [];
  const headings: MdHeading[] = [];
  const { tokens, top } = lexPlaced(md);
  const base = new Map<Frame, number>([[top, 0]]);
  const fail = (what: string, why: string): never => { throw new PlacementError(`cannot place a markdown ${what} on its source lines (${why})`); };
  /** The token's 0-based line, or null when marked gave it no position or its frame got no line. */
  const lineIf = (t: any): number | null => {
    const at: At = t.__at;
    const b = at ? base.get(at.frame) : undefined;
    return at && b !== undefined ? b + frameLine(at.frame, at.off) : null;
  };
  const lineOf = (t: any, what: string): number => lineIf(t) ?? fail(what, t.__at ? "its container could not be placed" : "marked gave it no position");
  const visit = (toks: any[], isTop: boolean) => {
    for (const t of toks) {
      if (t.type === "code" && t.codeBlockStyle !== "indented") {
        const what = `fence ${JSON.stringify(String(t.raw).split("\n")[0])}`;
        const k = lineOf(t, what);
        const body = t.text === "" ? [] : String(t.text).split("\n");
        if (k >= lines.length || !/^(`{3,}|~{3,})/.test(containerless(lines[k]))) fail(what, `line ${k + 1} is not its opener`);
        for (let b = 0; b < body.length; b++) {
          if (k + 1 + b >= lines.length || bodyKey(lines[k + 1 + b]) !== bodyKey(body[b])) fail(what, `line ${k + 2 + b} is not its body`);
        }
        codes.push({ open: k, text: String(t.text), info: String(t.lang ?? ""), depth: unquote(lines[k]).depth });
      } else if (t.type === "heading") {
        const first = containerless(String(t.raw).split("\n")[0]).trimEnd();
        const what = `heading ${JSON.stringify(first)}`;
        const k = lineOf(t, what);
        if (k >= lines.length || containerless(lines[k]).trimEnd() !== first) fail(what, `line ${k + 1} is not that heading`);
        headings.push({ line: k, level: t.depth, top: isTop });
      } else if (t.type === "blockquote") {
        // its text maps line for line onto its source lines; segment 1 starts it, and each later segment stands
        // right after the previous one (or after a child marked re-read past it). A frame that does not stand
        // exactly there — or a blockquote whose text and raw disagree in line count (marked re-joins a re-read
        // with an extra line) — gets no line: a fence or heading in it then fails, nothing else does
        const L = lineIf(t);
        const text = String(t.text);
        const lineCount = (x: string) => x.replace(/\n+$/, "").split("\n").length;
        const exact = lineCount(text) === lineCount(String(t.raw));
        const frames: Frame[] = t.__frames ?? [];
        const starts: number[] = [];
        for (let i = 0; i < frames.length; i++) {
          let start = 0;
          if (i > 0) {
            let end = starts[i - 1] + frames[i - 1].src.length;
            for (const c of t.tokens ?? []) {
              const j = c.__at ? frames.indexOf(c.__at.frame) : -1;
              if (j >= 0 && j < i) end = Math.max(end, starts[j] + c.__at.off + c.__len);
            }
            start = end + 1;
          }
          starts.push(start);
          if (L !== null && (i === 0 || exact) && text.startsWith(frames[i].src, start)) base.set(frames[i], L + nlBefore(text, start));
        }
        visit(t.tokens ?? [], false);
      } else if (t.type === "list") {
        // each item's text maps line for line onto its source lines from the item's first line
        const L = lineIf(t);
        const frames: Frame[] = t.__frames ?? [];
        let p = 0;
        for (let i = 0; L !== null && i < t.items.length; i++) {
          const it = t.items[i];
          if (!String(t.raw).startsWith(it.raw, p)) break;
          if (frames.length === t.items.length && frames[i].src === it.text) base.set(frames[i], L! + nlBefore(String(t.raw), p));
          p += it.raw.length;
        }
        for (const it of t.items) visit(it.tokens ?? [], false);
      }
    }
  };
  visit(tokens, true);
  return { codes, headings };
}

const NEG_MARKER = /^\s*<!--\s*retired-neg:\s*([\w-]+)(?:\s+(?:—|--|-)|\s*:)\s*[^\s>-][^>]*-->\s*$/;

/** `\r\n` and `\r` line ends as `\n` — exactly as marked reads them, so source lines and tokens agree — and a
 *  leading U+FEFF dropped, as cmark / GitHub drop it (#2101 r5rev LOW-1: neither marked nor commonmark.js does,
 *  so a BOM-prefixed fence went unread by both). */
export const normalizeEol = (md: string) => md.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n");

/**
 * Every fenced code block of a markdown text that is read (`readsInfo`), as CommonMark reads it (`mdBlocks`).
 * `startLine`: the 1-based line of its first body line (in the text with its line ends normalised); `text`: its
 * content. `negIds`: the row ids of `<!-- retired-neg: <id> — reason -->` markers on the line(s) directly above
 * the opener AT THE SAME BLOCKQUOTE DEPTH (#2101 r3: a `> <!-- … -->` does not mark an unquoted fence). No
 * region of any file is exempt (#2101 r4 F2): a negative is a marked fence, a case, or a `retired-ok` comment.
 */
export function readFences(md: string): Fence[] {
  md = normalizeEol(md);
  const lines = md.split("\n");
  const { codes } = mdBlocks(md);
  const out: Fence[] = [];
  for (const c of codes) {
    if (!readsInfo(c.info)) continue;
    const negIds = new Set<string>();
    for (let k = c.open - 1; k >= 0; k--) {
      const q = unquote(lines[k]);
      if (q.depth !== c.depth) break;
      const m = NEG_MARKER.exec(q.text);
      if (!m) break;
      negIds.add(m[1]);
    }
    out.push({ startLine: c.open + 2, text: c.text, negIds, info: c.info.trim().toLowerCase() });
  }
  crossCheck(md, out);
  return out;
}

/** A fence's text compared across the two readers: line ends, a final line break and each line's leading /
 *  trailing blanks are not content here (the readers differ only in how they expand a tab under a container). */
const fenceKey = (text: string) => text.split("\n").map((l) => l.trim()).join("\n").replace(/\n+$/, "");

/**
 * The second reader (#2101 r5 HIGH-1). marked 14 mis-reads some valid CommonMark — a fence after a lazy
 * continuation line inside a list in a blockquote (`> - a⏎b⏎> ```scrml…`) is lexed as paragraph text — and the
 * fence GitHub renders would go unread. commonmark.js, the reference implementation, reads the same text; when
 * the multiset of READ fence texts (`readsInfo`) of the two readers differs, the gate throws `PlacementError`
 * (exit 2): a fence one reader reads and the other does not is never silently passed. INTERIM: the capable form
 * is one reader that agrees with CommonMark. marked ≥ 18.0.0 (published 2026-04-07; 17.x and earlier do not)
 * agrees with commonmark.js on the 40,000 r4 fuzz documents and the lazy reproducers, but the placement wrappers
 * in `readFences` hook marked internals (`blockTokens`, tokenizer methods) and must be re-proven on marked ≥
 * 18.0.0 before the bump (g-tool-retired-lint-marked-bump-s482) — then this check only guards a regression.
 */
function crossCheck(md: string, read: Fence[]): void {
  const want = new Map<string, number>();
  const walker = new CommonmarkParser().parse(md).walker();
  for (let e = walker.next(); e; e = walker.next()) {
    const n = e.node;
    if (e.entering && n.type === "code_block" && n.info !== null && readsInfo(n.info)) {
      const k = fenceKey(n.literal ?? "");
      want.set(k, (want.get(k) ?? 0) + 1);
    }
  }
  for (const f of read) {
    const k = fenceKey(f.text);
    const n = want.get(k) ?? 0;
    if (n === 0) throw new PlacementError(`markdown fence at line ${f.startLine - 1} is read by marked but not by commonmark.js (the two CommonMark readers disagree)`);
    want.set(k, n - 1);
  }
  for (const [k, n] of want) {
    if (n > 0) throw new PlacementError(`markdown fence ${JSON.stringify(k.split("\n")[0].slice(0, 60))} is read by commonmark.js but not by marked (the two CommonMark readers disagree)`);
  }
}

export function scan(root: string, ledger: Ledger): Hit[] {
  const rows = ledger.rows.filter((r) => r.detector);
  const hits: Hit[] = [];
  const cache = new Map<string, Case | null>();
  const corpus = corpusOf(ledger);
  for (const rel of scrmlFiles(root, corpus)) {
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
  for (const rel of mdFiles(root, corpus)) {
    const md = normalizeEol(readFileSync(join(root, rel), "utf8"));
    const mdLines = md.split("\n");
    let fences: Fence[];
    try { fences = readFences(md); }
    catch (e) {
      if (e instanceof PlacementError) throw new PlacementError(`${rel}: ${e.message}`);
      throw e;
    }
    for (const f of fences) {
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
 * caseIdPattern — and the base's file set (`corpus`), scanned over this tree, must find no (row, file) count
 * above the base baseline. So a change that loosens what a row allows (a code added to `codes`, a widened
 * `caseIdPattern`, a detector replaced by a narrower or never-matching one, a newly excluded path) cannot
 * hide a new hit: the base rule still sees it. Drops are fine here (a migration lowers counts). The readers
 * and builtin detectors are this tree's script (a change to them is a reviewed code diff).
 */
export function baseRulesOnHead(root: string, baseLedger: Ledger, baseBaseline: Baseline, headCorpus?: Corpus): string[] {
  let hits: Hit[];
  // a base that predates `corpus` (#2101 before r3) is read with this tree's; a base's `migrationRegions`
  // (#2101 r2–r3) exempt nothing here (#2101 r4 F2: no region is exempt)
  const L: Ledger = { rows: baseLedger.rows, corpus: baseLedger.corpus ?? headCorpus };
  try { hits = scan(root, L); }
  catch (e) { return [`the base ledger's rules cannot be run over this tree: ${(e as Error).message}`]; }
  const errs: string[] = [];
  const c = counts(hits);
  for (const row of baseLedger.rows) {
    if (!row.detector) continue;
    const allowed: Record<string, number> = row.tier === "SOFT" ? baseBaseline.soft?.[row.id] ?? {} : baseBaseline.pending?.[row.id]?.files ?? {};
    for (const [f, n] of c.get(row.id) ?? new Map<string, number>()) {
      const a = allowed[f] ?? 0;
      if (n > a) errs.push(`base rule ${row.id} (${row.tier}) finds ${n} hit(s) in ${f}, the base baseline allows ${a} (a loosened ledger row cannot hide it)`);
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
  // #2101 r4 F2: migration regions are retired — no region of any file is exempt
  const regErrs = "migrationRegions" in ledger ? ["the ledger has `migrationRegions`: no region is exempt (#2101 r4) — mark each negative fence `<!-- retired-neg: <row-id> — reason -->`"] : [];
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
    if (baseLedger && baseBaseline) baseErrs = baseErrs.concat(baseRulesOnHead(root, baseLedger, baseBaseline, ledger.corpus));
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
    for (const e of regErrs) console.error(`  LEDGER: ${e}`);
    for (const e of baseErrs) console.error(`  BASELINE vs ${baseRef}: ${e}`);
    console.error("  List a row's hits: bun scripts/retired-forms-lint.ts --list <row-id>. A deliberate negative in markdown takes");
    console.error("  `<!-- retired-neg: <row-id> — reason -->` directly above its fence; in source, `// retired-ok: <row-id> — reason`");
    console.error("  in a comment on the line (or the line before).");
    return 1;
  }
  console.log(`\n✓ retired-forms-lint: every (row, file) count equals its baseline${baseRef ? `; baseline checked against ${baseRef}${baseNote}` : ""}`);
  return 0;
}

if (import.meta.main) {
  let code: number;
  try { code = main(); }
  catch (e) {
    // a markdown block the gate cannot place exactly (#2101 r4 NIT): a clean message, exit 2 — never a guess
    if (!(e instanceof PlacementError)) throw e;
    console.error(`retired-forms-lint: ${e.message} — the gate reads a block only at the line marked's lexer puts it, and only when commonmark.js reads the same fences; fix the markdown (or report a reader bug)`);
    code = 2;
  }
  process.exit(code);
}
