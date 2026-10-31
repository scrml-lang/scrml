#!/usr/bin/env bun
/**
 * gen-bootstrap-severity.ts — GENERATE compiler/self-host-v2/severity.scrml, the bootstrap's
 * diagnostic-severity table, from SPEC §34's catalog. change-id: s451-boot-diag-severity.
 *
 * WHY GENERATED. §34 (S451): "A code whose Severity column reads **Error** fails the compile, and a
 * compile that reports one SHALL NOT produce a runnable artifact (§2.2.1). **Warning** and **Info**
 * codes do not fail the compile." A bootstrap diagnostic's severity is therefore a property of its
 * CODE, owned by §34 — never something a call site states. The bootstrap's `Diag` gets its severity
 * from `severityOf(code)` (ast.scrml `newDiag`), and `severityOf` is this generated table, so no call
 * site can disagree with §34. The code's prefix is NOT the severity (§34 makes E-DG-002 a Warning
 * and 30-odd W- codes Info).
 *
 * WHAT IS IN THE TABLE. Every code the bootstrap's scrml sources name (a quoted `"E-…"` / `"W-…"` /
 * `"I-…"` literal in compiler/self-host-v2/*.scrml), with the severity its §34 row states (parsed by
 * scripts/s34-catalog.ts — the parser the §34 census uses). A code with NO usable row — no row, a
 * struck row, or a row whose Severity cell states no compile severity (`—`, `Runtime`, `Test`) —
 * is FAIL-CLOSED Error and is listed in the generated file's header as a catalog gap.
 *
 * Restricting the table to the bootstrap's own codes keeps it small and makes an unrelated §34 edit
 * inert; a §34 change to a code the bootstrap emits, or a new code literal in a bootstrap source,
 * makes the file stale — `--check` reports it. The self-host-v2 test severity.test.js checks
 * SEMANTICS only (compiled severityOf == §34 for every code the bootstrap names), so a docs-only §34
 * row that changes no answer does not go red.
 *
 * S474 (owner ruling: generated files regenerate post-merge). This file is CODE the bootstrap compiles
 * — the class a post-merge bot must not leave wrong on main. It is safe here because of the split
 * above: any drift that CHANGES an answer fails severity.test.js on the PR (blocking, CI `slices` and
 * the pre-commit slice step), so the PR must regenerate; only answer-NEUTRAL byte drift (a row added
 * with the severity the fail-closed default already gives, a header gap-list line) can reach main,
 * and .github/workflows/generated-regen.yml regenerates that after merge. CI `checks` runs `--check`
 * and WARNS on 4 / FAILS on anything else (a crashing generator would otherwise first fail on main).
 *
 * Usage:  bun scripts/gen-bootstrap-severity.ts            write severity.scrml
 *         bun scripts/gen-bootstrap-severity.ts --check    exit 4 when severity.scrml is stale (S474; was 1)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSeverityOf, parseS34Rows, type CompileSeverity } from "./s34-catalog.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_HOST_V2 = join(ROOT, "compiler", "self-host-v2");
export const SEVERITY_FILE = join(SELF_HOST_V2, "severity.scrml");
const SPEC = join(ROOT, "compiler", "SPEC.md");

/** The quoted diagnostic-code literals in the bootstrap's scrml modules (severity.scrml excluded). */
export function bootstrapCodes(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(SELF_HOST_V2).sort()) {
    if (!f.endsWith(".scrml") || f === "severity.scrml") continue;
    const src = readFileSync(join(SELF_HOST_V2, f), "utf8");
    for (const m of src.matchAll(/"([EWI]-[A-Z0-9]+(?:-[A-Z0-9]+)*)"/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * PROVISIONAL codes — named by the bootstrap, approved by the owner as provisional, and with NO §34 row
 * yet. Each carries its intended severity here until the SPEC follow-up adds its row; once the row
 * exists `resolveSeverities` throws (agreeing or not) until the entry is removed, so this table can
 * never shadow §34. Keep it SHORT: every entry is owed a §34 row.
 *   (empty — W-STRING-INTERP-LITERAL left when its §34 row landed, s469-spec-followup)
 */
export const PROVISIONAL: Record<string, CompileSeverity> = {};

export type SeverityEntry = { code: string; severity: CompileSeverity; line: number; provisional?: boolean };
export type CatalogGap = { code: string; why: string };

/** Resolve each code against §34. Throws when two live rows of one code disagree. */
/**
 * The PROVISIONAL table's own guards (s469 F/U-7) — each a THROW, never a silent fall-through:
 *   - a provisional code the bootstrap no longer emits (a stale entry);
 *   - a provisional `E-` code given Warning / Info (the table may not DOWNGRADE an error: a missing
 *     row already resolves fail-closed to Error, so an `E-` entry could only ever weaken it);
 *   - (in resolveSeverities) a provisional code that has a §34 row the generator cannot use (struck,
 *     or a non-compile severity): the row exists, so the table no longer speaks for it.
 */
export function checkProvisional(codes: string[], provisional: Record<string, CompileSeverity>): void {
  for (const [code, sev] of Object.entries(provisional)) {
    if (!codes.includes(code)) throw new Error(`PROVISIONAL ${code}: the bootstrap's sources no longer name it — remove the entry`);
    if (code.startsWith("E-") && sev !== "Error") throw new Error(`PROVISIONAL ${code}: an E- code may not be downgraded to ${sev} by the provisional table`);
  }
}

export function resolveSeverities(
  specText: string,
  codes: string[],
  provisional: Record<string, CompileSeverity> = PROVISIONAL,
): { entries: SeverityEntry[]; gaps: CatalogGap[] } {
  // the downgrade guard always; the stale-entry guard needs the bootstrap's WHOLE code set, so it
  // is `render`'s (a subset query — `resolveSeverities(spec, ["E-DG-002", …])` — is not a census)
  checkProvisional(Object.keys(provisional), provisional);
  const rows = parseS34Rows(specText.split("\n"));
  const entries: SeverityEntry[] = [];
  const gaps: CatalogGap[] = [];
  for (const code of codes) {
    const mine = rows.filter((r) => r.code === code);
    if (mine.length === 0) {
      if (provisional[code]) { entries.push({ code, severity: provisional[code], line: 0, provisional: true }); continue; }
      gaps.push({ code, why: "no §34 row" });
      continue;
    }
    const live = mine.filter((r) => compileSeverityOf(r) !== null);
    if (live.length === 0) {
      const r = mine[0];
      const why = r.struck ? "§34 row struck" : `§34 Severity "${r.severity}" is not a compile severity`;
      if (provisional[code]) throw new Error(`PROVISIONAL ${code}: it has a §34 row the generator cannot use (${why}) — fix the row or remove the entry (no silent fall-through to Error)`);
      // No SPEC line numbers in the generated text: an edit above the row would make the file
      // stale for a reason that changes nothing (the cry-wolf shape).
      gaps.push({ code, why });
      continue;
    }
    const sevs = [...new Set(live.map((r) => compileSeverityOf(r)!))];
    if (sevs.length > 1) throw new Error(`§34 rows for ${code} disagree on severity: ${live.map((r) => `${compileSeverityOf(r)}@${r.line}`).join(", ")}`);
    // a provisional entry exists only until its row lands: once the row exists — agreeing or not —
    // the entry is stale and is removed (the row decides; the table never shadows §34)
    if (provisional[code]) throw new Error(`PROVISIONAL ${code}: its §34 row exists (${sevs[0]}; the table says ${provisional[code]}) — the row decides; remove the entry`);
    entries.push({ code, severity: sevs[0], line: live[0].line });
  }
  return { entries, gaps };
}

/** The generated module text. */
export function render(specText: string, codes: string[], table: Record<string, CompileSeverity> = PROVISIONAL): string {
  checkProvisional(codes, table);       // every entry is a code the bootstrap still names
  const { entries, gaps } = resolveSeverities(specText, codes, table);
  const arms = (sev: CompileSeverity) =>
    entries.filter((e) => e.severity === sev && !e.provisional).map((e) => `            "${e.code}" :> Severity.${sev}`);
  const provisional = entries.filter((e) => e.provisional);
  const L: string[] = [];
  L.push("// =============================================================================");
  L.push("// self-host-v2 / severity.scrml — GENERATED by scripts/gen-bootstrap-severity.ts");
  L.push("// from SPEC §34's catalog. DO NOT EDIT: run `bun scripts/gen-bootstrap-severity.ts`.");
  L.push("// (CI tracking runs `--check`; severity.test.js checks every answer against §34.)");
  L.push("//");
  L.push("// §34 (S451): \"A code whose Severity column reads **Error** fails the compile, and");
  L.push("// a compile that reports one SHALL NOT produce a runnable artifact (§2.2.1).");
  L.push("// **Warning** and **Info** codes do not fail the compile.\"");
  L.push("//");
  L.push("// A diagnostic's severity is its CODE's §34 row — never a call site's choice:");
  L.push("// ast.scrml `newDiag` is the one Diag constructor and reads `severityOf`. The");
  L.push("// code's prefix is not the severity (§34 makes E-DG-002 a Warning, many W- Info).");
  L.push("//");
  L.push(`// ${entries.length - provisional.length} codes with a §34 severity; ${provisional.length} PROVISIONAL (no row yet, severity from the`);
  L.push(`// generator's PROVISIONAL table: ${provisional.map((e) => e.code).join(", ") || "none"}); ${gaps.length} without one (FAIL-CLOSED Error):`);
  for (const g of gaps) L.push(`//   ${g.code} — ${g.why}`);
  L.push("// =============================================================================");
  L.push("${");
  L.push("    export type Severity:enum = { Error, Warning, Info }");
  L.push("");
  L.push("    // The §34 severity of a diagnostic code. A code with no usable §34 row is an");
  L.push("    // Error (fail closed): an uncatalogued diagnostic never lets an artifact through.");
  L.push("    export fn severityOf(code: string) -> Severity {");
  L.push("        return match code {");
  L.push("            // §34 Severity: Warning");
  L.push(...arms("Warning"));
  L.push("            // §34 Severity: Info");
  L.push(...arms("Info"));
  L.push("            // §34 Severity: Error");
  L.push(...arms("Error"));
  if (provisional.length > 0) {
    L.push("            // PROVISIONAL — no §34 row yet (scripts/gen-bootstrap-severity.ts PROVISIONAL; each owes a row)");
    for (const e of provisional) L.push(`            "${e.code}" :> Severity.${e.severity}`);
  }
  L.push("            // no usable §34 row — fail closed (listed in the header)");
  L.push("            _ :> Severity.Error");
  L.push("        }");
  L.push("    }");
  L.push("}");
  L.push("");
  return L.join("\n");
}

/**
 * The ANSWERS a severity table gives: every `"CODE" :> Severity.X` arm, plus the `_ :>` default.
 * S474 r1 (review F1): `--check` compares these between the fresh render and the file on disk. A
 * difference is NOT staleness for the bot to absorb — it means the generator (or §34, or the sources)
 * now produces different answers than the compiled table, and severity.test.js only checks the ON-DISK
 * table against §34, so a broken `render()` would pass the PR and break `slices` on the bot's own PR
 * (auto-merge never fires; every derived block stops updating on main). So: answers differ → exit 1.
 */
export function answerMap(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of text.replace(/\r\n/g, "\n").matchAll(/^\s*(?:"([EWI]-[A-Z0-9-]+)"|(_))\s*:>\s*Severity\.(\w+)\s*$/gm)) {
    const k = x[1] ?? "_";
    if (m.has(k)) m.set(k, `${m.get(k)}|DUPLICATE`); else m.set(k, x[3]);
  }
  return m;
}

/**
 * Codes whose EFFECTIVE answer differs between two tables. A code with no arm answers the `_` default,
 * so moving a code from the fail-closed default to an explicit arm of the SAME severity (a §34 row
 * added that agrees with the default) is byte drift, not an answer change.
 */
export function answerDiff(a: Map<string, string>, b: Map<string, string>): string[] {
  const eff = (m: Map<string, string>, k: string) => m.get(k) ?? m.get("_") ?? "(none)";
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = eff(a, k), y = eff(b, k);
    if (x !== y) out.push(`${k}: ${x} -> ${y}`);
  }
  return out.sort();
}

if (import.meta.main) {
  const text = render(readFileSync(SPEC, "utf8"), bootstrapCodes());
  if (process.argv.includes("--check")) {
    let cur = "";
    try { cur = readFileSync(SEVERITY_FILE, "utf8"); } catch {}
    const diff = answerDiff(answerMap(cur), answerMap(text));
    if (diff.length > 0) {
      console.error(
        `compiler/self-host-v2/severity.scrml gives DIFFERENT ANSWERS than a fresh generation (${diff.length}) — exit 1 (blocking):\n` +
          diff.slice(0, 20).map((d) => `  ${d}  (on disk -> fresh)`).join("\n") +
          (diff.length > 20 ? `\n  … +${diff.length - 20} more` : "") +
          `\nIf §34 or the bootstrap's code literals changed, regenerate in THIS PR (\`bun scripts/gen-bootstrap-severity.ts\`)` +
          ` and let severity.test.js judge it; if the generator changed, it is wrong until the regenerated table passes that test.`,
      );
      process.exit(1);
    }
    if (cur !== text) {
      // S474 — 4 (not 1, which is also bun's crash code): stale only. CI WARNS on 4 and fails on any
      // other non-zero; generated-regen.yml regenerates main after merge. An answer-CHANGING drift is
      // not left to the bot: slice-m4/severity.test.js fails the PR itself (see the header).
      console.error("compiler/self-host-v2/severity.scrml is STALE against SPEC §34 / the bootstrap sources — run `bun scripts/gen-bootstrap-severity.ts` (exit 4)");
      process.exit(4);
    }
    console.log("severity.scrml is current");
  } else {
    writeFileSync(SEVERITY_FILE, text);
    console.log("wrote compiler/self-host-v2/severity.scrml");
  }
}
