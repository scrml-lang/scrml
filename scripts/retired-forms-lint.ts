#!/usr/bin/env bun
/**
 * scripts/retired-forms-lint.ts — the RETIRED-FORMS GATE (S482, s482-retired-lint).
 *
 * WHY. A retired form survived in the SPEC's own examples for seven months after Appendix E retired it
 * (2026-04-09), was copied into a conformance case and the bootstrap, and was re-adopted as a "terse
 * `/}` closer" (S482 audit, ~/.cache/scrml/review/s482-retired-audit/report.md). Root cause: no gate read
 * SPEC fences (claim-gate.js excludes SPEC by design), retirements landed as banners instead of
 * migrations, and bulk SPEC rewrites preserved the retired text. Owner: "if I cant trust that language
 * rulings from that long ago are being honered, how am I supposed to believe that we are on the right
 * track?" This gate makes that impossible to recur silently.
 *
 * RULINGS (scrml-support/user-voice-scrml.md):
 *   S482 "⭐ RULED — every retirement / deprecation PR adds a retired-forms ledger row and migrates" —
 *     "every PR that retires or deprecates a syntax form must do both: 1. add a row to the retired-forms
 *     ledger (`compiler/retired-forms.json`) …; 2. migrate the SPEC examples, or for a deprecated form,
 *     record the starting count, which then only goes down." Enforced here: "hard forms fail CI outside
 *     labelled negatives; soft counts may not rise".
 *   S482 "⭐ RULED — every SPEC example is in the current language, except labelled negatives and marked
 *     deprecated demonstrations" (R1).
 *
 * WHAT IT READS. compiler/retired-forms.json (the ledger) — each row with a `detector` (a regex over
 * comment- and string-stripped scrml, or a builtin below). Rows whose detector is null are compiler-
 * enforced only (not detectable from text) and are listed, never counted.
 *
 * WHERE IT LOOKS (SCAN):
 *   - ```scrml fences in compiler/SPEC.md and the public markdown (README.md files, docs/tutorial.md,
 *     docs/website, docs/adopter, docs/articles minus archive/);
 *   - .scrml files in conformance/cases, compiler/self-host-v2/acceptance, samples, examples, stdlib,
 *     docs/tutorial-snippets, docs/readme-snippets, docs/website.
 *   Stripped before matching: `//` comments (at a line start or after whitespace — `http://x` is text),
 *   `/* … *\/`, `<!-- … -->`, single-line "…" / '…' strings and `…` templates (unless the row says
 *   keepStrings), `_{ … }` foreign bodies, `?{ … }` SQL, `#{ … }` CSS, `<style>` / `<script>` bodies.
 *
 * WHAT IS ALLOWED (never counted):
 *   - a LABELLED NEGATIVE: a conformance / acceptance case whose expected.json `expect.codes` holds one of
 *     the row's codes; a SPEC / markdown fence whose text or the 4 lines before it name one of the row's
 *     codes;
 *   - the migration sections of the SPEC (Appendix E, §63, §66.21) — a migration table shows the old form
 *     on purpose (only fences are read anyway, so markdown tables never count);
 *   - an explicit marker: `<!-- retired-ok: <id> — reason -->` within the 3 lines before a fence (the
 *     fence), or `retired-ok: <id>` in a comment on the hit's line or the line before (a .scrml file).
 *
 * THE BASELINE (scripts/retired-forms-baseline.json):
 *   soft[row][file]            a SOFT row's count per file — may not rise (a new file is a rise from 0).
 *   pending[row] {since, why, files}   HARD debt, DATED and printed on every run — may not rise either.
 *   A HARD hit outside `pending` FAILS. A count below its baseline is reported (lower it with --update).
 *
 * USAGE
 *   bun scripts/retired-forms-lint.ts               check (exit 1 on a HARD hit outside pending, or a rise)
 *   bun scripts/retired-forms-lint.ts --update      rewrite the baseline DOWN to the current counts (never up;
 *                                                   a row/file above its baseline still fails)
 *   bun scripts/retired-forms-lint.ts --init        write the baseline from the current counts (first run only)
 *   bun scripts/retired-forms-lint.ts --json        machine-readable report on stdout
 *   bun scripts/retired-forms-lint.ts --list <id>   every hit of one row (file:line: text)
 *   bun scripts/retired-forms-lint.ts --quiet       one summary line unless it fails (the pre-commit hook)
 *   bun scripts/retired-forms-lint.ts --root <dir>  scan another tree (default: the repo this script is in)
 *     --ledger <path> / --baseline <path>          read the ledger / baseline from elsewhere (measuring a tree
 *                                                  that has neither, e.g. main before this gate landed)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Detector = { kind: "regex"; pattern: string; flags: string } | { kind: "builtin"; name: string } | null;
export type Row = { id: string; tier: "HARD" | "SOFT"; old: string; new: string; codes: string[]; spec: string; ruling: string; detector: Detector; keepStrings?: boolean; note?: string };
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
export const MD_FILES = ["compiler/SPEC.md", "docs/tutorial.md"];
export const MD_ROOTS = ["docs/website", "docs/adopter", "docs/articles"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "archive"]);

// --------------------------------------------------------------------------------------------------
// stripping — comments, strings, foreign bodies become spaces (newlines and columns kept)
// --------------------------------------------------------------------------------------------------

const blank = (s: string) => s.replace(/[^\n]/g, " ");

/** The end (exclusive) of the balanced `{ … }` whose `{` is at `open`, or the text length. */
function braceEnd(t: string, open: number): number {
  let depth = 0;
  for (let i = open; i < t.length; i++) {
    const c = t[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  return t.length;
}

export function stripScrml(text: string, keepStrings = false): string {
  let t = text;
  // raw bodies
  t = t.replace(/<(style|script|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, blank);
  // comments
  t = t.replace(/<!--[\s\S]*?-->/g, blank);
  t = t.replace(/\/\*[\s\S]*?\*\//g, blank);
  t = t.replace(/(^|[ \t])\/\/[^\n]*/gm, (m, pre) => pre + blank(m.slice(pre.length)));
  // foreign / SQL / CSS bodies (balanced braces)
  for (const open of ["_{", "_={", "_=={", "?{", "#{"]) {
    let at = t.indexOf(open);
    while (at >= 0) {
      const b = at + open.length - 1;
      const end = braceEnd(t, b);
      t = t.slice(0, at) + blank(t.slice(at, end)) + t.slice(end);
      at = t.indexOf(open, end);
    }
  }
  if (!keepStrings) {
    t = t.replace(/`[^`]*`/g, blank);
    t = t.replace(/"[^"\n]*"/g, blank);
    t = t.replace(/(?<![\w])'[^'\n]*'/g, blank);
  }
  return t;
}

// --------------------------------------------------------------------------------------------------
// builtin detectors
// --------------------------------------------------------------------------------------------------

/** Does the `/` at `j` end a URL / path word (a word, back to a space / `>` / `}`, holding another `/` or `:`)? */
function pathSlash(line: string, j: number): boolean {
  for (let k = j - 1; k >= 0; k--) {
    const c = line[k];
    if (c === " " || c === "\t" || c === ">" || c === "}") return false;
    if (c === "/" || c === ":") return true;
  }
  return false;
}

/** The retired trailing-`/` closer (Appendix E): `content/` or a bare `/` ending its line, before a `;`
 *  (`lift <li>x/;`) or a value's `}` (`{<div>x/}`) — not `//`, `*\/`, `</`, `/>`, `=/` or a path word. */
function trailingSlashLines(stripped: string): number[] {
  const out: number[] = [];
  stripped.split("\n").forEach((line, i) => {
    const re = /\//g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const j = m.index;
      const prev = j > 0 ? line[j - 1] : "";
      const next = line[j + 1] ?? "";
      if (prev === "/" || next === "/" || next === ">" || prev === "*" || next === "*" || prev === "<" || prev === "=") continue;
      const rest = line.slice(j + 1);
      if (!/^[ \t]*(?:$|;|\})/.test(rest)) continue;
      if (/^[ \t]*$/.test(line.slice(0, j)) && /^[ \t]*$/.test(rest)) { out.push(i + 1); break; }   // a bare `/` line
      // `x /` — a division / operator (or a `/;/` regex) after a space is not one
      if (prev === "" || prev === " " || prev === "\t") continue;
      if (pathSlash(line, j)) continue;
      out.push(i + 1);
      break;
    }
  });
  return out;
}

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

/** A legacy cell read `<n>` in a value position (R3; E-CELL-ANGLE-READ): after `=` `(` `,` `{` `?` `:` `!`
 *  `return` `&&` `||`, a bare `<name>` (lowercase or `_` first — `<Point>` is a type) that is not an HTML
 *  element name, followed by `; ) , ] }`, an operator or a `.`. `<n> = v` (a declaration) is not one. */
function angleReadLines(stripped: string, root: string): number[] {
  const out: number[] = [];
  const names = htmlNames(root);
  stripped.split("\n").forEach((line, i) => {
    const re = /(?:[=(,{?:!]|\breturn|&&|\|\|)\s*<([a-z_]\w*)>[ \t]*(=(?!=)|[;),\]}]|[-+*/%!&|?>.=]|<(?![A-Za-z/!]))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const follow = m[2];
      if (!follow || follow === "=" || names.has(m[1].toLowerCase())) continue;
      out.push(i + 1);
      break;
    }
  });
  return out;
}

// --------------------------------------------------------------------------------------------------
// detection
// --------------------------------------------------------------------------------------------------

/** 1-based line numbers of `row`'s hits in a stripped scrml text (one per line). */
const STRIP_CACHE = new Map<string, string>();
function stripped(text: string, keepStrings: boolean): string {
  const k = (keepStrings ? "1" : "0") + text;
  let s = STRIP_CACHE.get(k);
  if (s === undefined) {
    if (STRIP_CACHE.size > 64) STRIP_CACHE.clear();
    s = stripScrml(text, keepStrings);
    STRIP_CACHE.set(k, s);
  }
  return s;
}

export function rowLines(row: Row, text: string, root: string): number[] {
  const d = row.detector;
  if (!d) return [];
  const s = stripped(text, row.keepStrings === true);
  if (d.kind === "builtin") {
    if (d.name === "trailing-slash-closer") return trailingSlashLines(s);
    if (d.name === "angle-cell-read") return angleReadLines(s, root);
    throw new Error(`retired-forms-lint: unknown builtin detector ${d.name} (row ${row.id})`);
  }
  const lines = new Set<number>();
  if (d.flags.includes("m")) {
    const re = new RegExp(d.pattern, d.flags.includes("g") ? d.flags : d.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      lines.add(s.slice(0, m.index).split("\n").length);
      if (m[0].length === 0) re.lastIndex++;
    }
  } else {
    const re = new RegExp(d.pattern, d.flags);
    s.split("\n").forEach((l, i) => { if (re.test(l)) lines.add(i + 1); });
  }
  return [...lines].sort((a, b) => a - b);
}

/** `retired-ok: <id>` in the raw line or the one before it. */
function markerAllows(rawLines: string[], line: number, id: string): boolean {
  const re = new RegExp(`retired-ok:\\s*${id.replace(/[-]/g, "\\-")}\\b`);
  return re.test(rawLines[line - 1] ?? "") || re.test(rawLines[line - 2] ?? "");
}

// --------------------------------------------------------------------------------------------------
// the corpus
// --------------------------------------------------------------------------------------------------

function walk(root: string, rel: string, ext: string, out: string[]) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  if (statSync(abs).isFile()) { if (abs.endsWith(ext)) out.push(rel); return; }
  for (const e of readdirSync(abs).sort()) {
    if (SKIP_DIRS.has(e) || e.startsWith(".")) continue;
    walk(root, join(rel, e), ext, out);
  }
}

export function scrmlFiles(root: string): string[] {
  const out: string[] = [];
  for (const r of SCRML_ROOTS) walk(root, r, ".scrml", out);
  return [...new Set(out)].sort();
}

export function mdFiles(root: string): string[] {
  const out: string[] = [];
  for (const f of MD_FILES) if (existsSync(join(root, f))) out.push(f);
  for (const r of MD_ROOTS) walk(root, r, ".md", out);
  for (const r of ["README.md", "examples", "stdlib"]) {
    const tmp: string[] = [];
    walk(root, r, ".md", tmp);
    for (const f of tmp) if (f.endsWith("README.md")) out.push(f);
  }
  return [...new Set(out)].sort();
}

/** The expected codes of the conformance / acceptance case holding `rel` (its dir's expected.json), or []. */
function caseCodes(root: string, rel: string, cache: Map<string, string[]>): string[] {
  if (!rel.startsWith("conformance/cases/") && !rel.startsWith("compiler/self-host-v2/acceptance/")) return [];
  let dir = dirname(rel);
  for (; dir.includes("/"); dir = dirname(dir)) {
    if (cache.has(dir)) return cache.get(dir)!;
    const p = join(root, dir, "expected.json");
    if (existsSync(p)) {
      let codes: string[] = [];
      try {
        const ex = JSON.parse(readFileSync(p, "utf8"));
        codes = [...(ex?.expect?.codes ?? []), ...Object.keys(ex?.expect?.codeCounts ?? {})];
      } catch { codes = []; }
      cache.set(dir, codes);
      return codes;
    }
  }
  return [];
}

type Fence = { startLine: number; text: string; before: string[]; section: string };

/** The ```scrml fences of a markdown text, with the 4 lines before each and the heading it sits under. */
export function scrmlFences(md: string): Fence[] {
  const lines = md.split("\n");
  const out: Fence[] = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) { section = h[2]; continue; }
    const f = /^(\s*)(```+|~~~+)\s*scrml\b/.exec(lines[i]);
    if (!f) continue;
    const fenceTok = f[2];
    let j = i + 1;
    for (; j < lines.length && !lines[j].trimStart().startsWith(fenceTok); j++) {}
    out.push({ startLine: i + 2, text: lines.slice(i + 1, j).join("\n"), before: lines.slice(Math.max(0, i - 4), i), section });
    i = j;
  }
  return out;
}

/** The SPEC sections whose fences show retired forms on purpose (migration guides / the §63 lifecycle). */
export function migrationSection(heading: string): boolean {
  return /^Appendix E\b/i.test(heading) || /^63(\.|\s)/.test(heading) || /^66\.21\b/.test(heading);
}

export function scan(root: string, ledger: Ledger): Hit[] {
  const rows = ledger.rows.filter((r) => r.detector);
  const hits: Hit[] = [];
  const cache = new Map<string, string[]>();
  for (const rel of scrmlFiles(root)) {
    const raw = readFileSync(join(root, rel), "utf8");
    const rawLines = raw.split("\n");
    const expected = caseCodes(root, rel, cache);
    for (const row of rows) {
      if (row.codes.some((c) => expected.includes(c))) continue;   // a labelled negative for this row
      for (const ln of rowLines(row, raw, root)) {
        if (markerAllows(rawLines, ln, row.id)) continue;
        hits.push({ row: row.id, file: rel, line: ln, text: (rawLines[ln - 1] ?? "").trim().slice(0, 160) });
      }
    }
  }
  for (const rel of mdFiles(root)) {
    const md = readFileSync(join(root, rel), "utf8");
    const mdLines = md.split("\n");
    for (const f of scrmlFences(md)) {
      if (rel === "compiler/SPEC.md" && migrationSection(f.section)) continue;
      const label = f.before.join("\n") + "\n" + f.text;
      const fLines = f.text.split("\n");
      for (const row of rows) {
        if (row.codes.some((c) => label.includes(c))) continue;    // a labelled negative for this row
        if (new RegExp(`retired-ok:\\s*${row.id}\\b`).test(f.before.slice(-3).join("\n"))) continue;
        for (const ln of rowLines(row, f.text, root)) {
          if (markerAllows(fLines, ln, row.id)) continue;
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

export function check(ledger: Ledger, hits: Hit[], base: Baseline): { ok: boolean; rows: RowReport[] } {
  const c = counts(hits);
  const rows: RowReport[] = [];
  let ok = true;
  for (const row of ledger.rows) {
    if (!row.detector) continue;
    const now = c.get(row.id) ?? new Map<string, number>();
    const allowed: Record<string, number> = row.tier === "SOFT" ? base.soft[row.id] ?? {} : base.pending[row.id]?.files ?? {};
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
      if (n < a) rep.drops.push(`${f}: ${a} -> ${n}`);
    }
    rows.push(rep);
  }
  return { ok, rows };
}

/** The baseline lowered to the current counts — never raised (a rise still fails the check). */
export function lowered(ledger: Ledger, hits: Hit[], base: Baseline): Baseline {
  const c = counts(hits);
  const out: Baseline = { $comment: base.$comment, soft: {}, pending: {} };
  for (const row of ledger.rows) {
    const now = c.get(row.id) ?? new Map<string, number>();
    const src = row.tier === "SOFT" ? base.soft[row.id] : base.pending[row.id]?.files;
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
  const base: Baseline = existsSync(bpath) ? JSON.parse(readFileSync(bpath, "utf8")) : { soft: {}, pending: {} };
  const res = check(ledger, hits, base);
  if (flag("--update")) {
    writeFileSync(bpath, JSON.stringify(lowered(ledger, hits, base), null, 2) + "\n");
    console.error(`retired-forms-lint: baseline lowered to the current counts (${relative(root, bpath)})`);
  }
  const ms = Math.round(performance.now() - t0);
  if (flag("--json")) {
    console.log(JSON.stringify({ ok: res.ok, ms, rows: res.rows, hits }, null, 2));
    return res.ok ? 0 : 1;
  }
  if (flag("--quiet") && res.ok) {
    const debt = Object.values(base.pending ?? {}).reduce((a, p) => a + Object.values(p.files).reduce((x, y) => x + y, 0), 0);
    console.log(`retired-forms-lint: OK (${hits.length} hits; pending HARD debt ${debt}; ${ms} ms)`);
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
  let drops = 0;
  for (const r of res.rows) drops += r.drops.length;
  if (drops) console.log(`\n  ${drops} (row, file) count(s) are BELOW the baseline — lower it: bun scripts/retired-forms-lint.ts --update`);
  if (!res.ok) {
    console.error("\n✗ retired-forms-lint FAILED");
    for (const r of res.rows) {
      for (const f of r.newHard) console.error(`  HARD ${r.id}: ${f} — a retired form (${ledger.rows.find((x) => x.id === r.id)!.old}); write ${ledger.rows.find((x) => x.id === r.id)!.new}`);
      for (const f of r.rises) console.error(`  ${r.tier} ${r.id}: count rose — ${f}`);
    }
    console.error("  List a row's hits: bun scripts/retired-forms-lint.ts --list <row-id>. A deliberate demonstration takes");
    console.error("  `<!-- retired-ok: <row-id> — reason -->` before its fence (or `// retired-ok: <row-id>` on the line).");
    return 1;
  }
  console.log("\n✓ retired-forms-lint: no HARD hit outside pending, no count rose");
  return 0;
}

if (import.meta.main) process.exit(main());
