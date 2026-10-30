// scripts/spec-coverage-check.ts — the bootstrap SPEC-coverage gate (S473).
//
// WHY THIS EXISTS. SPEC §47 (Output Name Encoding) was found unimplemented in the bootstrap with no
// gap, no refusal and no ruling — by accident. The S473 six-part audit then found ~70 more such
// SILENT items. `docs/bootstrap-spec-coverage.md` records, per SPEC section, what the bootstrap
// (compiler/self-host-v2) does with it. This gate keeps that table from rotting into the next §47:
//
//   (a) every top-level § in compiler/SPEC-INDEX.md's Sections table has at least one row
//       (granularity is TOP-LEVEL on purpose: a new subsection needs no busywork, a new § does);
//   (b) a row whose status is SILENT-ACCEPT or SILENT-ABSENT cites at least one gap id;
//   (c) every cited gap id exists as an `@gap` marker in docs/known-gaps.md;
//   (d) WARN only: a cited gap is closed (resolved / fixed / deferred / …) while its row still
//       says SILENT-* or PARTIAL — the row (or the gap) needs a look;
//   plus: every status is in the fixed vocabulary, every gap token is well formed, the scan found
//   rows at all (a zero over a failed parse is not a pass), and the generated totals block is current.
//
// USAGE
//   bun scripts/spec-coverage-check.ts            check (CI `checks` job; pre-commit when SPEC.md,
//                                                 SPEC-INDEX.md, the coverage doc or known-gaps.md is staged)
//   bun scripts/spec-coverage-check.ts --write    regenerate the @generated:coverage-totals block
//   --index <p> --coverage <p> --gaps <p>         override the three inputs (tests use fixtures)
//
// EXIT: 0 pass (warnings allowed) · 1 a violation (a/b/c, bad status, bad token, stale totals) ·
//       2 the inputs could not be read or parsed (no Sections rows, no coverage rows, no @gap markers).

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { classifyGapStatus } from "./state.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

export const STATUSES = [
  "BUILT", "PARTIAL", "REFUSED-LOUD", "DEFERRED-RULED", "N/A", "SILENT-ACCEPT", "SILENT-ABSENT", "UNVERIFIED",
] as const;
const SILENT = new Set(["SILENT-ACCEPT", "SILENT-ABSENT"]);
const WATCH = new Set(["SILENT-ACCEPT", "SILENT-ABSENT", "PARTIAL"]);
const TOTALS_START = "<!-- @generated:coverage-totals START (do not edit — `bun scripts/spec-coverage-check.ts --write`) -->";
const TOTALS_END = "<!-- @generated:coverage-totals END -->";

/** Split one markdown table row into trimmed cells. `\|` is an escaped pipe, not a separator. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") { cur += "|"; i++; continue; }
    if (line[i] === "|") { cells.push(cur); cur = ""; continue; }
    cur += line[i];
  }
  cells.push(cur);
  return cells.slice(1, -1).map((c) => c.trim());
}

/** The top-level section id of a § cell: "§6.4.1" → "6", "47.1.1b" → "47", "App. D.1" → "D". */
export function topOf(cell: string): string | null {
  const s = cell.replace(/\*\*/g, "").replace(/^§\s*/, "").trim();
  const app = s.match(/^App(?:endix)?\.?\s*([A-Z])\b/i);
  if (app) return app[1].toUpperCase();
  const num = s.match(/^(\d+)/);
  return num ? String(parseInt(num[1], 10)) : null;
}

/** Top-level ids from SPEC-INDEX.md's `## Sections` table (numbers and appendix letters; the TOC row "—" is skipped). */
export function indexTops(indexText: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  const lines = indexText.split("\n");
  const start = lines.findIndex((l) => /^##\s+Sections\b/.test(l));
  if (start < 0) return out;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) break;
    if (!l.startsWith("|")) continue;
    const c = splitRow(l);
    if (c.length < 2 || /^-+$/.test(c[0]) || c[0] === "§") continue;
    if (/^(\d+|[A-Z])$/.test(c[0])) out.push({ id: c[0], title: c[1] });
  }
  return out;
}

export type CoverageRow = { line: number; sec: string; top: string | null; title: string; status: string; gaps: string[]; rawGaps: string };

/** Rows of every table whose header is `§ | title | status | evidence | gap ids | note`. */
export function coverageRows(coverageText: string): CoverageRow[] {
  const rows: CoverageRow[] = [];
  let inTable = false;
  coverageText.split("\n").forEach((l, idx) => {
    if (!l.startsWith("|")) { inTable = false; return; }
    const c = splitRow(l);
    const low = c.map((x) => x.toLowerCase());
    if (low[0] === "§" && low[2] === "status" && low[4] === "gap ids") { inTable = true; return; }
    if (!inTable || c.every((x) => /^:?-+:?$/.test(x))) return;
    const rawGaps = c[4] ?? "";
    const gaps = rawGaps === "" || rawGaps === "—" ? [] : rawGaps.split(/[\s,]+/).filter(Boolean).map((g) => g.replace(/^`|`$/g, ""));
    rows.push({ line: idx + 1, sec: c[0] ?? "", top: topOf(c[0] ?? ""), title: c[1] ?? "", status: (c[2] ?? "").replace(/\*\*/g, ""), gaps, rawGaps });
  });
  return rows;
}

/** `@gap` markers → id → status (first attribute occurrence wins, as in scripts/state.ts). */
export function gapStatuses(gapsText: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<!--\s*@gap\s+([\s\S]*?)\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(gapsText)) !== null) {
    const attrs = new Map<string, string>();
    for (const pair of m[1].trim().split(/\s+/)) {
      const eq = pair.indexOf("=");
      if (eq > 0 && !attrs.has(pair.slice(0, eq))) attrs.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    const id = attrs.get("id");
    if (id && !id.startsWith("<") && !out.has(id)) out.set(id, attrs.get("status") ?? "");
  }
  return out;
}

export function renderTotals(rows: CoverageRow[]): string {
  const counts = new Map<string, number>(STATUSES.map((s) => [s, 0]));
  for (const r of rows) if (counts.has(r.status)) counts.set(r.status, counts.get(r.status)! + 1);
  const gapped = rows.filter((r) => SILENT.has(r.status) && r.gaps.length > 0).length;
  const silent = rows.filter((r) => SILENT.has(r.status)).length;
  const lines = [TOTALS_START, "| status | rows |", "|---|---:|"];
  for (const s of STATUSES) lines.push(`| ${s} | ${counts.get(s)} |`);
  lines.push(`| **total** | **${rows.length}** |`);
  lines.push("");
  lines.push(`SILENT rows carrying a gap id: ${gapped} of ${silent}.`);
  lines.push(TOTALS_END);
  return lines.join("\n");
}

export type Result = { errors: string[]; warnings: string[]; fatal: string | null; rows: CoverageRow[]; totals: string; totalsCurrent: boolean };

export function checkCoverage(indexText: string, coverageText: string, gapsText: string): Result {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tops = indexTops(indexText);
  const rows = coverageRows(coverageText);
  const gaps = gapStatuses(gapsText);
  const totals = renderTotals(rows);
  const res = (fatal: string | null): Result => ({
    errors, warnings, fatal, rows, totals,
    totalsCurrent: coverageText.includes(totals),
  });
  if (tops.length === 0) return res("no top-level sections parsed from the SPEC-INDEX `## Sections` table");
  if (rows.length === 0) return res("no coverage rows parsed (expected tables headed `| § | title | status | evidence | gap ids | note |`)");
  if (gaps.size === 0) return res("no @gap markers parsed from the known-gaps file");

  const covered = new Set(rows.map((r) => r.top).filter((t): t is string => t !== null));
  for (const t of tops) if (!covered.has(t.id)) errors.push(`(a) §${t.id} "${t.title}" is in SPEC-INDEX but has no row in the coverage doc`);

  for (const r of rows) {
    const where = `line ${r.line} (§ ${r.sec})`;
    if (r.top === null) errors.push(`${where}: the § cell names no section`);
    if (!(STATUSES as readonly string[]).includes(r.status)) errors.push(`${where}: unknown status "${r.status}" (allowed: ${STATUSES.join(", ")})`);
    for (const g of r.gaps) {
      if (!/^g-[a-z0-9][a-z0-9-]*$/.test(g)) { errors.push(`${where}: malformed gap id token "${g}"`); continue; }
      const st = gaps.get(g);
      if (st === undefined) { errors.push(`(c) ${where}: cites ${g}, which has no @gap marker in known-gaps`); continue; }
      if (WATCH.has(r.status) && classifyGapStatus(st) === "closed") {
        warnings.push(`(d) ${where}: cites ${g} (status=${st}) but the row still says ${r.status} — re-classify the row or re-open the gap`);
      }
    }
    if (SILENT.has(r.status) && r.gaps.length === 0) errors.push(`(b) ${where}: status ${r.status} with no gap id — SILENT is not allowed without a gap`);
  }
  const out = res(null);
  if (!out.totalsCurrent) errors.push("the @generated:coverage-totals block is stale or missing — run `bun scripts/spec-coverage-check.ts --write`");
  return out;
}

function argOf(argv: string[], flag: string, dflt: string): string {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}

export function main(argv: string[]): number {
  const indexPath = argOf(argv, "--index", `${ROOT}/compiler/SPEC-INDEX.md`);
  const covPath = argOf(argv, "--coverage", `${ROOT}/docs/bootstrap-spec-coverage.md`);
  const gapsPath = argOf(argv, "--gaps", `${ROOT}/docs/known-gaps.md`);
  let indexText: string, covText: string, gapsText: string;
  try {
    indexText = readFileSync(indexPath, "utf8");
    covText = readFileSync(covPath, "utf8");
    gapsText = readFileSync(gapsPath, "utf8");
  } catch (e) {
    console.error(`spec-coverage-check: cannot read an input: ${(e as Error).message}`);
    return 2;
  }
  const r = checkCoverage(indexText, covText, gapsText);
  if (r.fatal) { console.error(`spec-coverage-check: ${r.fatal}`); return 2; }
  if (argv.includes("--write")) {
    const s = covText.indexOf(TOTALS_START.slice(0, 40));
    const e = covText.indexOf(TOTALS_END);
    if (s < 0 || e < 0) { console.error("spec-coverage-check: --write needs the @generated:coverage-totals anchors in the coverage doc"); return 2; }
    const next = covText.slice(0, s) + r.totals + covText.slice(e + TOTALS_END.length);
    if (next !== covText) writeFileSync(covPath, next);
    console.log("spec-coverage-check: totals block regenerated");
    return main(argv.filter((a) => a !== "--write"));
  }
  for (const w of r.warnings) console.warn(`WARN  ${w}`);
  for (const e of r.errors) console.error(`FAIL  ${e}`);
  const silent = r.rows.filter((x) => SILENT.has(x.status)).length;
  console.log(`spec-coverage-check: ${r.rows.length} rows, ${silent} SILENT (all must carry a gap), ${r.warnings.length} warning(s), ${r.errors.length} violation(s)`);
  return r.errors.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
