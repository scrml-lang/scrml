/**
 * @module commands/fix-variant-colons
 * The `scrml fix` rule `variant-colons` — §14.5 / §63 (S482): the deprecated `::` enum variant
 * access → `.`. `TypeName::Variant` → `TypeName.Variant`, `::Variant` → `.Variant`, in an
 * expression, a match / `!{}` arm pattern and a `fail` operand alike. Lint it clears:
 * W-VARIANT-COLONS-LEGACY (reserved E-VARIANT-COLONS-LEGACY). change-id: s482-colons-deprecate.
 *
 * Ruling: user-voice-scrml.md S482 "⭐ RULED — `::` variant access is deprecated (§63 window:
 * warning + `scrml fix` to `.`)" — *"deprecate `::`: put it in the §63 migration window … It keeps
 * compiling with a warning (W-VARIANT-COLONS-LEGACY) and a `scrml fix` rewrite to `.`. The corpus
 * gets migrated … When the window closes, it is refused. One spelling, consistent with S452."*
 * Owner: "yes, deprecate :: with warning and fix". (ruling:user-voice-scrml.md-S482-deprecate-colons)
 *
 * ═══ THE REWRITE ═══
 *
 *   The two characters `::` become `.`. Nothing else is touched: the type name, the variant name,
 *   its payload and the spacing around the site stay as written.
 *
 * ═══ WHERE IT LOOKS, HOW IT READS (never a regex over source text) ═══
 *
 * impl#1's block splitter says where the code is and impl#1's logic tokenizer reads it
 * (fix-terminators.js `codeRegions` / `regionTokens`): every `${ … }` block, a `<program>` / `<page>`
 * body's bare code, a module file's bare top-level declarations, every `on…={ … }` handler. On top
 * of those, every attribute value impl#1 reads as code — `attr=(expr)`, `attr=${expr}`,
 * `onclick=f(args)`, `attr={ … }`, and each `${ … }` inside a quoted attribute value — of every
 * markup / state block (tokenizeAttributes). Nested `${ … }` and `!{ … }` blocks met in code, and the
 * `${ … }` interpolations of a template literal, are read as regions of their own.
 *
 * A site is impl#1's `::` OPERATOR token glued to the variant name after it, and either glued to a
 * type name before it (`E::V`) or standing where an operand starts (`::V`). A string, a comment, a
 * regex literal and a `?{}` (SQL — `x::int` is a cast there), `#{}` (CSS — `::before`) block are one
 * token each, so never a site; markup text and a quoted attribute's literal text are not code. A `::`
 * this rule finds in code it does not enter (a `~{}` test or `^{}` meta block, markup written inside
 * code — `lift <li onclick=f(E::A)>`) is reported for a human, never rewritten. scrml has no other
 * `::` in code (§14.5 is its only production), so a `::` that is not a variant site — `E ::V` with a
 * space before it, `::` before something that is not a name — is reported too.
 *
 * ═══ HOW IT VERIFIES ═══
 *
 * impl#1 reads `::` and `.` variant access alike (§14.5 made `::` an alias; impl#1 has no lint for
 * it). So impl#1 compiles the file before and after, at the same path with its project beside it
 * (fix-terminators.js `makeReader`): the diagnostic codes must be identical and every emitted
 * artifact the same (JS compared as its syntax tree; a `::` → `.` echo of source text in an artifact
 * folded on both sides). A file that does not compile is refused (§63.4). When the whole file fails
 * the check, the sites are bisected and every site that changes impl#1's reading on its own is
 * withdrawn and reported; the rest are kept.
 *
 * Idempotent: the output has no `::` site, so a second run makes no edit.
 *
 * impl#1-safe: a default rule (IMPL1_SAFE_RULES) — its output is `.` variant access, which impl#1
 * compiles.
 */

import { splitBlocks } from "../block-splitter.js";
import { tokenizeLogic, tokenizeAttributes } from "../tokenizer.ts";
import { captureTrailingContentWarnings } from "../expression-parser.ts";
import { codeRegions, regionTokens, lineStarts, lineAt, UndelimitedMarkup, makeReader, normalizedArtifact } from "./fix-terminators.js";
import { scratchRefusalReason } from "./fix-verify-shared.js";

export const VARIANT_COLONS_RULE = "variant-colons";
export const VARIANT_COLONS_LINT = "W-VARIANT-COLONS-LEGACY";

/** A `::` glued to a name start — the text shape of a variant site (pre-check and leftover scan only). */
const COLONS_G = /::(?=[A-Za-z_$])/g;
const isName = (t) => !!t && (t.kind === "IDENT" || t.kind === "KEYWORD");
const isColons = (t) => !!t && t.kind === "OPERATOR" && t.text === "::";
/** Tokens after which a `::V` is an operand only if it is glued to them (a value ends there). */
const endsValue = (t) => !!t && (t.kind === "IDENT" || t.kind === "NUMBER" || t.kind === "STRING" || (t.kind === "PUNCT" && (t.text === ")" || t.text === "]")));

/** The `${ … }` interpolations of a template literal / quoted attribute value `source[s, e)`, as [start, end) of their code. */
function interpolations(source, s, e) {
  const out = [];
  let i = s;
  while (i < e) {
    const k = source.indexOf("${", i);
    if (k === -1 || k >= e) break;
    // Find the matching `}`: braces balance; a quoted string inside is skipped.
    let depth = 1;
    let j = k + 2;
    while (j < e && depth > 0) {
      const c = source[j];
      if (c === '"' || c === "'" || c === "`") {
        const q = c;
        j++;
        while (j < e && source[j] !== q) { if (source[j] === "\\") j++; j++; }
      } else if (c === "{") depth++;
      else if (c === "}") depth--;
      j++;
    }
    if (depth !== 0) break;
    out.push({ start: k + 2, end: j - 1 });
    i = j;
  }
  return out;
}

/**
 * impl#1's block tree, walked (any depth): every markup / state block, and the spans of the `~{}` test
 * and `^{}` meta blocks (code this rule does not enter).
 */
function walkBlocks(filePath, source) {
  let bs;
  try {
    bs = captureTrailingContentWarnings(() => splitBlocks(filePath, source)).result;
  } catch {
    return { markup: [], unentered: [] };
  }
  const markup = [];
  const unentered = [];
  const visit = (b) => {
    if (!b || typeof b !== "object") return;
    if (b.type === "markup" || b.type === "state") markup.push(b);
    if ((b.type === "test" || b.type === "meta") && b.span) unentered.push({ start: b.span.start, end: b.span.end, what: `a \`${b.type === "test" ? "~" : "^"}{ … }\` block` });
    for (const c of b.children ?? []) visit(c);
  };
  for (const b of bs.blocks ?? []) visit(b);
  return { markup, unentered };
}

/** The code regions of one markup / state block's attribute values. */
function attributeRegions(source, block, notes) {
  let toks;
  try {
    toks = tokenizeAttributes(block.raw, block.span.start, block.span.line ?? 1, block.span.col ?? 1, block.type === "state" ? "state" : "markup");
  } catch {
    return [];
  }
  const out = [];
  for (const v of toks) {
    const s = v.span.start;
    const e = v.span.end;
    if (v.kind === "ATTR_EXPR" || v.kind === "ATTR_BLOCK" || v.kind === "ATTR_CALL") {
      if (source.startsWith("${", s) && source[e - 1] === "}") out.push({ start: s + 2, end: e - 1, children: [] });
      else if (v.kind === "ATTR_BLOCK" && source[s] === "{" && source[e - 1] === "}") out.push({ start: s + 1, end: e - 1, children: [] });
      else out.push({ start: s, end: e, children: [] });
    } else if (v.kind === "ATTR_STRING") {
      for (const r of interpolations(source, s, e)) out.push({ ...r, children: [] });
    } else if (v.kind !== "ATTR_NAME" && v.kind !== "ATTR_EQ" && !String(v.kind).startsWith("TAG_")) {
      if (COLONS_G.test(source.slice(s, e))) notes.push({ at: s, reason: `a \`::\` in an attribute value impl#1 reads as ${v.kind} — this rule does not read that kind; rewrite it to \`.\` by hand (§14.5)` });
      COLONS_G.lastIndex = 0;
    }
  }
  return out;
}

/**
 * Every `::` variant site of `source`, unverified: `{ sites: [{ start, end, line }], notes: [{ at, line, reason }], errors }`.
 * A site is the `::` token's own span; its edit writes `.` there.
 */
export function planVariantColons(filePath, source) {
  const ls = lineStarts(source);
  const sites = [];
  const notes = [];
  const seen = new Set(); // site starts (a region can be reached twice: a handler is also an attribute)
  /** Spans this rule read as code (a leftover `::` inside one, not a site, is a string / comment / non-site). */
  const read = [];
  /** Spans inside read code that this rule does not enter (a leftover `::` there is reported). */
  const skipped = [];
  const { regions, errors } = codeRegions(filePath, source);
  const queue = regions.map((r) => ({ start: r.start, end: r.end, children: r.children ?? [] }));
  const tree = walkBlocks(filePath, source);
  skipped.push(...tree.unentered);
  for (const b of tree.markup) queue.push(...attributeRegions(source, b, notes));
  const done = new Set();
  while (queue.length) {
    const r = queue.shift();
    const key = `${r.start}:${r.end}`;
    if (done.has(key) || r.end <= r.start) continue;
    done.add(key);
    let toks;
    try {
      toks = regionTokens(source, r.start, r.end, r.children, ls, []);
    } catch (e) {
      if (COLONS_G.test(source.slice(r.start, r.end))) {
        notes.push({ at: e instanceof UndelimitedMarkup ? e.at : r.start, reason: e instanceof UndelimitedMarkup
          ? "markup inside code whose end this rule cannot find — the `::` around it is left as written; rewrite it to `.` by hand (§14.5)"
          : `impl#1's tokenizer threw on this region (${String(e?.message ?? e).split("\n")[0]}) — its \`::\` is left as written` });
      }
      COLONS_G.lastIndex = 0;
      continue;
    }
    read.push({ start: r.start, end: r.end });
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.kind === "BLOCK_REF") {
        const two = source.slice(t.start, t.start + 2);
        const kids = t.child?.children ?? (r.children ?? []).find((c) => c.span?.start === t.start)?.children ?? [];
        if (two === "!{" || two === "${") queue.push({ start: t.start + 2, end: t.end - 1, children: kids });
        else if (two === "~{" || two === "^{") skipped.push({ start: t.start, end: t.end, what: `a \`${two} … }\` block` });
        // `?{}` (SQL) / `#{}` (CSS) / foreign bodies: not scrml code; a `::` there is theirs.
        continue;
      }
      if (t.kind === "MARKUP") { skipped.push({ start: t.start, end: t.end, what: "markup written inside code" }); continue; }
      if (t.kind === "STRING" && source[t.start] === "`") {
        for (const x of interpolations(source, t.start + 1, t.end - 1)) queue.push({ ...x, children: [] });
        continue;
      }
      if (!isColons(t)) continue;
      const n = toks[i + 1];
      const p = toks[i - 1];
      const at = t.start;
      if (!isName(n) || n.start !== t.end) {
        notes.push({ at, reason: "a `::` that is not followed by a variant name — not a §14.5 variant site; left as written" });
        continue;
      }
      // Glued to what is before it: a type name (`E::V`), or an opener / operator / separator where an
      // operand starts (`f(::V)`, `[::A,::B]`, `x==::A`). Glued to anything else — a value end
      // (`)`, `]`, `}`, a literal) or a keyword (`return::V`) — `.` would read as a member access.
      const gluedOk = (x) => x.kind === "IDENT" || ((x.kind === "PUNCT" || x.kind === "OPERATOR") && x.text !== ")" && x.text !== "]" && x.text !== "}");
      if (p && p.end === t.start && !gluedOk(p)) {
        notes.push({ at, reason: `a \`::\` glued to \`${source.slice(p.start, p.end)}\` — not a \`TypeName::Variant\` site; left as written` });
        continue;
      }
      // A value then a space then `::V` on the same line (`E ::V`): `.` would read as a member access.
      // On a later line it starts a new arm / item (`"r"⏎::Green :> …`) — the verify checks that impl#1
      // reads the `.` spelling the same way.
      if (p && p.end !== t.start && endsValue(p) && p.endLine === t.line) {
        notes.push({ at, reason: `\`${source.slice(p.start, p.end)} ::${n.text}\` — a \`::\` with a space before it after a value; \`.\` there would read differently. Write \`${p.kind === "IDENT" ? p.text : "…"}.${n.text}\` (or \`.${n.text}\`) by hand (§14.5)` });
        continue;
      }
      if (seen.has(at)) continue;
      seen.add(at);
      sites.push({ start: t.start, end: t.end, line: lineAt(ls, at) });
    }
  }
  // A `::` this rule saw no token for: inside code it does not enter → reported; outside all code
  // (markup text, CSS, SQL, a quoted attribute's literal text) → not scrml variant access.
  const inside = (spans, off) => spans.find((x) => off >= x.start && off < x.end) ?? null;
  for (const m of source.matchAll(COLONS_G)) {
    const off = m.index;
    if (seen.has(off)) continue;
    const sk = inside(skipped, off);
    if (sk) { notes.push({ at: off, reason: `a \`::\` inside ${sk.what} — this rule does not enter it; rewrite it to \`.\` by hand if it is variant access (§14.5)` }); continue; }
    if (inside(read, off)) continue;
    // Outside every region this rule read. Markup text, CSS and SQL are not code — but a region
    // impl#1's splitter did not hand out (a file it reads differently) would hide a real site here, so
    // a variant-shaped `::V` (an upper-case name after it; CSS pseudo-elements are lower-case) on a
    // line that is not a `//` comment is reported rather than passed over in silence.
    const ls0 = source.lastIndexOf("\n", off - 1) + 1;
    const before = source.slice(ls0, off);
    if (/^[A-Z]/.test(source.slice(off + 2, off + 3)) && !before.includes("//") && !/^\s*\*/.test(before)) {
      notes.push({ at: off, reason: "a `::` outside the code this rule reads (impl#1's block splitter gave it no code region) — rewrite it to `.` by hand if it is variant access (§14.5)" });
    }
  }
  sites.sort((a, b) => a.start - b.start);
  const uniq = new Map();
  for (const x of notes) if (!uniq.has(x.at)) uniq.set(x.at, x);
  return {
    sites,
    notes: [...uniq.values()].sort((a, b) => a.at - b.at).map((x) => ({ ...x, line: lineAt(ls, x.at) })),
    errors,
  };
}

function applyEdits(source, sites) {
  let out = "";
  let cur = 0;
  for (const s of [...sites].sort((a, b) => a.start - b.start)) {
    out += source.slice(cur, s.start) + ".";
    cur = s.end;
  }
  return out + source.slice(cur);
}

/** An artifact as the verify compares it: a `::` → `.` echo of source text folded on both sides. */
const foldColons = (text) => normalizedArtifact(text).replace(/::(?=[A-Za-z_$])/g, ".");

/**
 * Rewrite every `::` enum variant access of ONE file to `.`.
 * @param {string} source
 * @param {{ filePath?: string, auxSources?: Record<string,string>, verify?: boolean, inPlaceClean?: boolean,
 *           allowNonCompiling?: boolean, maxCompiles?: number }} [opts]
 * @returns {{ output: string, changed: boolean, applied: Array<{rule:string,line:number,detail:string}>,
 *             blockers: Array<{rule:string,line:number,reason:string,snippet:string}> }}
 */
export function fixVariantColons(source, opts = {}) {
  const filePath = opts.filePath ?? "input.scrml";
  const blockers = [];
  const none = { output: source, changed: false, applied: [], blockers };
  // Cheap pre-check (it only decides whether to read the file; nothing is located by it).
  if (!source.includes("::")) return none;
  const ls = lineStarts(source);
  const snippet = (line) => source.slice(ls[line - 1], ls[line] !== undefined ? ls[line] - 1 : source.length).trim().slice(0, 120);
  const plan = planVariantColons(filePath, source);
  for (const e of plan.errors) blockers.push({ rule: VARIANT_COLONS_RULE, line: 1, reason: e, snippet: "" });
  for (const x of plan.notes) blockers.push({ rule: VARIANT_COLONS_RULE, line: x.line, reason: x.reason, snippet: snippet(x.line) });
  let sites = plan.sites;
  if (sites.length === 0) return none;

  if (opts.verify !== false) {
    const reader = makeReader(filePath, opts.auxSources, foldColons);
    try {
      const base = reader.read(source);
      if (base.errs.length > 0 && !opts.allowNonCompiling) {
        blockers.push({ rule: VARIANT_COLONS_RULE, line: sites[0].line, reason: `${scratchRefusalReason(base.errs, filePath, source, opts.inPlaceClean)} — no \`::\` rewritten`, snippet: snippet(sites[0].line) });
        return none;
      }
      let budget = opts.maxCompiles ?? 40;
      const same = (set) => {
        budget--;
        const r = reader.read(applyEdits(source, set));
        return r.codes === base.codes && r.outputs === base.outputs;
      };
      if (!same(sites)) {
        const kept = [];
        const rejected = [];
        const untried = [];
        const stack = [sites];
        while (stack.length) {
          const g = stack.pop();
          if (budget <= 0) { untried.push(...g); continue; }
          if (same([...kept, ...g])) { kept.push(...g); continue; }
          if (g.length === 1) { rejected.push(g[0]); continue; }
          const mid = g.length >> 1;
          stack.push(g.slice(mid), g.slice(0, mid));
        }
        for (const s of rejected) blockers.push({ rule: VARIANT_COLONS_RULE, line: s.line, reason: "impl#1 reads this site differently once `::` is written `.` (emitted artifacts or codes) — not rewritten; check by hand", snippet: snippet(s.line) });
        for (const s of untried) blockers.push({ rule: VARIANT_COLONS_RULE, line: s.line, reason: "not rewritten: the verify budget ran out before this site could be checked on its own — run `scrml fix` on the file again", snippet: snippet(s.line) });
        sites = kept.sort((a, b) => a.start - b.start);
      }
    } catch (e) {
      blockers.push({ rule: VARIANT_COLONS_RULE, line: sites[0].line, reason: `the verify compile threw: ${String(e?.message ?? e).split("\n")[0]} — no \`::\` rewritten`, snippet: "" });
      return none;
    } finally {
      reader.done();
    }
  }
  if (sites.length === 0) return none;
  const output = applyEdits(source, sites);
  const applied = sites.map((s) => ({ rule: VARIANT_COLONS_RULE, line: s.line, detail: "`::` variant access → `.`" }));
  return { output, changed: output !== source, applied, blockers };
}
