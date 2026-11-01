/**
 * scripts/doc-boot-check.js
 *
 * Compile one scrml source with the BOOTSTRAP for the public-docs gates
 * (`scripts/claim-gate.js`, `scripts/snippet-gate.js`), in memory — nothing is written.
 * It is `scripts/scrml-boot.ts`'s `compileSource` (the same path `bun run boot:compile`
 * takes), so a doc block passes exactly when `boot:compile` would exit 0: no
 * Error-severity diagnostic and no printer refusal. Warnings do not fail.
 *
 * The bootstrap bundle loads once per process (built by impl#1 on a cold cache, ~10 s;
 * cached on disk afterwards — see scrml-boot.ts SPEED).
 */

import { compileSource, formatDiagnostic } from "./scrml-boot.ts";

/**
 * @param {string} absPath  the path the source is compiled AS (need not exist on disk when `text` is given)
 * @param {string} [text]   the source; omitted → read from `absPath`
 * @param {Function} [compile] the compiler (default scrml-boot's compileSource; tests inject one)
 * @returns {Promise<{ ok: boolean, crash: boolean, codes: string[], keys: string[], lines: string[] }>}
 *   `codes`: the Error-severity diagnostic codes, in order; `keys`: each one's pin key (pinKey);
 *   `lines`: one line per diagnostic.
 */
export async function bootCheck(absPath, text, compile = compileSource) {
  try {
    const overlay = text === undefined ? undefined : new Map([[absPath, text]]);
    const r = await compile(absPath, { overlay });
    const errors = r.diagnostics.filter((d) => d.severity === "error");
    return {
      ok: r.ok,
      crash: false,
      codes: errors.map((d) => d.code),
      keys: errors.map(pinKey),
      lines: r.diagnostics.map((d) => formatDiagnostic(d, "line")),
    };
  } catch (e) {
    return { ok: false, crash: true, codes: ["BOOTSTRAP-CRASH"], keys: ["BOOTSTRAP-CRASH"], lines: [`bootstrap crash: ${String(e?.message ?? e)}`] };
  }
}

/** A short "what the bootstrap said" summary: the distinct error codes, most frequent first. */
export function codeSummary(codes, max = 4) {
  const n = new Map();
  for (const c of codes) n.set(c, (n.get(c) ?? 0) + 1);
  const sorted = [...n.entries()].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, max).map(([c, k]) => (k > 1 ? `${c}×${k}` : c));
  if (sorted.length > max) shown.push(`+${sorted.length - max} more`);
  return shown.join(", ");
}

/**
 * The NAME-RESOLUTION codes: a pin names what each one is reported for. S474 backfill (#1489-1):
 * in a spec-ahead block the bootstrap often cannot resolve a name the SPEC declares (a function in
 * an unsupported `<channel>`), so the block already expects an E-SCOPE-001, and a misspelled call
 * swaps one undeclared name for another — the same code, the same count.
 */
export const NAMED_CODES = new Set(["E-SCOPE-001", "E-STATE-UNDECLARED"]);

/** A diagnostic's pin key: its code, with the name it is about for a NAMED_CODES code (`E-SCOPE-001(addRow)`). */
export function pinKey(d) {
  if (!NAMED_CODES.has(d.code)) return d.code;
  const m = /`([^`]+)`/.exec(String(d.message ?? ""));
  return m ? `${d.code}(${m[1]})` : d.code;
}

/** A multiset of pin keys in pin syntax, sorted by code: `E-A×2, E-B, E-SCOPE-001(x, y)`. */
export function pinText(keys) {
  const counts = new Map();
  const names = new Map();
  for (const k of keys) {
    const m = /^([^()]+)\((.*)\)$/.exec(k);
    if (m) {
      if (!names.has(m[1])) names.set(m[1], []);
      names.get(m[1]).push(m[2]);
    } else counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const parts = [];
  for (const c of [...new Set([...counts.keys(), ...names.keys()])].sort()) {
    const k = counts.get(c);
    if (k !== undefined) parts.push(k > 1 ? `${c}×${k}` : c);
    if (names.has(c)) parts.push(`${c}(${names.get(c).sort().join(", ")})`);
  }
  return parts.join(", ");
}

/**
 * A spec-ahead marker may pin the bootstrap's expected Error diagnostics: a MULTISET of pin keys
 * (parseGateMarker expands `E-A×2` to `E-A, E-A` and `E-SCOPE-001(x, y)` to one key per name).
 * `keys` are the reported diagnostics' pin keys (pinKey; a bare code list compares the same way
 * for codes outside NAMED_CODES). Returns null when they are equal (or nothing is pinned), else a
 * message naming both, the reported one in pin syntax, ready to paste. S474 backfill (#1489-1):
 * this compared SETS of distinct codes, so a typo in a block that already pinned E-SCOPE-001
 * passed both gates.
 */
export function pinMismatch(pins, codes) {
  if (!pins) return null;
  const want = pinText(pins);
  const got = pinText(codes);
  if (want === got) return null;
  return `pinned codes [${want}] but the bootstrap reported [${got}] — fix the block, or update the pin if the bootstrap's refusal legitimately changed`;
}

/**
 * How a SPEC-AHEAD block's bootstrap result counts — one rule for both gates:
 *   "crash"         a bootstrap crash: always a FAILURE (never an expected failure)
 *   "pin-mismatch"  it failed, but not with the pinned codes: a FAILURE
 *   "stale"         it compiled: the marker should go (a failure only under --strict)
 *   "expected"      it failed the expected way
 * @returns {{ verdict: "crash" | "pin-mismatch" | "stale" | "expected", message: string | null }}
 */
export function classifySpecAhead(r, pins) {
  if (r.crash) return { verdict: "crash", message: "bootstrap crash on a spec-ahead block" };
  if (r.ok) return { verdict: "stale", message: null };
  const m = pinMismatch(pins, r.keys ?? r.codes);
  if (m) return { verdict: "pin-mismatch", message: m };
  return { verdict: "expected", message: null };
}
