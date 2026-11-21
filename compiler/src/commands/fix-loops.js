/**
 * @module commands/fix-loops
 * The `scrml fix` rules `loop-while` and `loop-do-while` — the S469 one-`for` loop migration.
 * change-id: s481-trackm2-selfhost (Track M step 2).
 *
 * Ruling: user-voice-scrml.md S469 "⭐ RULED — loops: one `for`", F1 "One `for` (Recommended)".
 * SPEC §49.4.1: "A `while` statement SHALL be rejected with E-LOOP-WHILE-RETIRED, whose fix-it is
 * `for (cond) { … }` (the same head, the keyword renamed). A `do...while` statement SHALL be rejected
 * with E-LOOP-DO-WHILE-RETIRED, whose fix-it is §49.3.6's body-first loop." §34 E-LOOP-WHILE-RETIRED:
 * "fix-it `for (cond) { … }` (`scrml fix` rewrites it)". S480 "Track M first": the `scrml fix` work is
 * impl#1 (`compiler/src/commands/`), admitted as a bootstrap-build tool.
 *
 * ═══ THE REWRITES ═══
 *
 *   loop-while      `while (cond) { … }`  →  `for (cond) { … }`. Only the keyword changes, so a label
 *                   (`outer: while …`) stays, and so do the head and the body as written.
 *   loop-do-while   `do { body } while (cond);`  →  `for { body if (!(cond)) { break; } }` — §49.3.6's
 *                   body-first loop ("for { …; if (done) { break; } }"), with `done` written as the
 *                   negated condition. Refused (reported, never rewritten) when:
 *                     - the body holds a `continue`: there §49.3.6 names a different exact rewrite (a
 *                       counted head, `for (let first = true; first || cond; first = false)`), whose
 *                       `||` needs a boolean `cond` (§42.4) this rule cannot see. Left for a human;
 *                     - the body declares a name the condition reads: the condition moves INTO the
 *                       body, where that declaration would capture it (in the `do…while` it did not);
 *                     - a destructuring declaration in the body (its names are not read here).
 *
 * Not rewritten, reported: a braceless `while (c) stmt` (§49.2.1 `loop-body` is braced), a head that
 * holds `in` / `of` / `;` at its top level (as a `for` head it would read as an iterate or counted head),
 * and a `while` / `do` in code this rule does not enter (a template literal's `${ … }`, a nested
 * `${ … }` inside code, markup written inside code). Strings, comments, regex and `?{}` / `#{}` / `^{}`
 * / `~{}` blocks are never edited (one token each, or never entered).
 *
 * ═══ WHERE IT LOOKS, HOW IT READS ═══
 *
 * Exactly as stmt-semi / arm-comma (fix-terminators.js): impl#1's block splitter finds the code
 * regions (`codeRegions`) and impl#1's tokenizer reads them (`regionTokens`); `!{ … }` bodies met in
 * that code are read as regions of their own.
 *
 * ═══ HOW IT VERIFIES ═══
 *
 * The output (`for (cond)`, `for { … }`) is ruled scrml that impl#1 does not compile (§49.8: impl#1
 * "has no condition head `for (cond)`, no `for { … }` head"; it reports E-IMPL1-RULED-FORM-UNSUPPORTED).
 * So the verify compiles, with impl#1, the same edits spelled with heads impl#1 DOES read — the counted
 * head `for (; cond; )` for a `while`, `for (;;)` for a `do…while` (both SPEC heads, §49.1) — and
 * requires identical diagnostic codes and identical artifacts, JS compared as its syntax tree with every
 * loop put in one canonical shape on both sides: `while (c) B` ≡ `for (; c; ) B`, and
 * `do { S } while (c)` ≡ `for (;;) { S if (!(c)) { break; } }`. That proves each edit sits on a real
 * loop statement as impl#1 reads it, that the matched parentheses are its whole head, and that the
 * body-first form means what the `do…while` meant. Edits that fail are bisected out and reported.
 *
 * Idempotent: the output has no `while` / `do` statement left for a second run to rewrite.
 *
 * NOT impl#1-safe: the rules are in S66_RULES (opt-in, `--s66` / `--rules=`), never in
 * IMPL1_SAFE_RULES (the CLI defaults), because their output does not compile under impl#1.
 *
 * ═══ INTERIM SPELLING (S481, PA decision) ═══
 *
 * `interim: true` (CLI `--loop-interim`) writes the verify's own impl#1-readable spelling instead:
 * `for (; cond; )` and `for (;;) { body if (!(cond)) { break; } }`. That output DOES compile under impl#1,
 * so with it the rules need no `--s66` (still opt-in, never a default). It exists for the self-host,
 * whose bootstrap bundle impl#1 builds; the rename to `for (cond)` follows once the bootstrap builds it.
 * A `do…while` whose body holds a `continue` is still refused in this mode — INTERIM, not PERMANENT:
 * the capable form is a flag-variable rewrite (`let again = true; for (; again; ) { … }`, with
 * `again = !(!(cond))` written at the body's end and before each `continue` of this loop), built in a
 * later pass (gap g-selfhost-while-migration-blocked-s481). 0 such loops in the self-host.
 *
 * A `while` whose head holds a string / template / regex literal is spelled top-check —
 * `for (;;) { if (!(cond)) { break; } … }` — because impl#1 mangles those literals in a `for` head.
 * That moves the condition INTO the body's block scope, so (S482, review MED-1 of #2046) the loop is
 * refused when the body declares, at its top level, a name the condition reads (`let` / `const` /
 * `lin` / `var` / `function` / `fn` / `class`, any declarator, a cell opener; destructuring and a
 * condition whose names cannot be read fail closed). The verify's canonical fold checks the same thing
 * on impl#1's emitted JS: it folds a top-check into `for (; c; )` only when the body's top-level
 * declarations do not meet the names the test reads.
 */

import { codeRegions, regionTokens, lineStarts, lineAt, UndelimitedMarkup, makeReader, normalizedArtifact } from "./fix-terminators.js";
import { scratchRefusalReason } from "./fix-verify-shared.js";

export const WHILE_RULE = "loop-while";
export const DO_WHILE_RULE = "loop-do-while";
export const LOOP_RULES = Object.freeze([WHILE_RULE, DO_WHILE_RULE]);

const OPEN = { "(": ")", "[": "]", "{": "}" };
const isKw = (t, w) => !!t && t.kind === "KEYWORD" && t.text === w;
const isP = (t, p) => !!t && (t.kind === "PUNCT" || t.kind === "OPERATOR") && t.text === p;
const LOOP_WORD_RE = /\b(?:while\s*\(|do\s*\{)/;
const LOOP_WORD_G = /\b(?:while\s*\(|do\s*\{)/g;

/** The matching bracket of every bracket token, or null when the region does not balance. */
function bracketMatches(toks) {
  const match = new Map();
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "PUNCT" && t.kind !== "OPERATOR") continue;
    if (OPEN[t.text]) stack.push(i);
    else if (t.text === ")" || t.text === "]" || t.text === "}") {
      const o = stack.pop();
      if (o === undefined || OPEN[toks[o].text] !== t.text) return null;
      match.set(o, i);
      match.set(i, o);
    }
  }
  return stack.length === 0 ? match : null;
}

/** Indentation (leading blanks) of the line holding offset `off`. */
function indentAt(source, off) {
  const ls = source.lastIndexOf("\n", off - 1) + 1;
  return /^[ \t]*/.exec(source.slice(ls))[0];
}
/** Is the text between `a` and `b` blank (no comment, no code)? */
const blank = (source, a, b) => /^\s*$/.test(source.slice(a, b));

/**
 * Plan one region's loop sites. A site is `{ rule, at, out: edits, probe: edits }` — `out` the edits
 * written, `probe` the impl#1-readable spelling the verify compiles. Edits are `{ start, end, text }`.
 */
function scanLoops(source, toks, want, sites, notes, nested) {
  const n = toks.length;
  const match = bracketMatches(toks);
  if (!match) {
    if (toks.some((t) => isKw(t, "while") || isKw(t, "do"))) notes.push({ at: toks[0].start, reason: "a code region whose brackets do not balance as this rule reads them — its loops are left as written" });
    return;
  }
  for (let i = 0; i < n; i++) {
    const t = toks[i];
    if (t.kind === "BLOCK_REF" && t.child && t.child.type === "error-effect") {
      nested.push({ start: t.child.span.start + 2, end: t.child.span.end - 1, children: t.child.children ?? [] });
      continue;
    }
    // `~{}` / `^{}` blocks: code this rule does not enter (S481 review LOW-1). Say so when one holds a
    // loop, so a clean report never hides a `while` the bootstrap then flags (E-LOOP-WHILE-RETIRED).
    if (t.kind === "BLOCK_REF" && (source.startsWith("~{", t.start) || source.startsWith("^{", t.start))) {
      // One note per loop word (text-level: a word in a string or comment of the block is noted too —
      // over-reporting, the safe direction for a note).
      for (const hit of source.slice(t.start, t.end).matchAll(LOOP_WORD_G)) {
        notes.push({ at: t.start + hit.index, reason: `a \`while\` / \`do\` inside a \`${source.slice(t.start, t.start + 2)} … }\` block — this rule does not enter it; rewrite it by hand (§49.4.1)` });
      }
      continue;
    }
    // Code this rule does not enter: say so when it holds a loop.
    if ((t.kind === "STRING" && source[t.start] === "`") || (t.kind === "BLOCK_REF" && source.startsWith("${", t.start)) || t.kind === "MARKUP") {
      const text = source.slice(t.start, t.end);
      if (/\$\{/.test(text) && LOOP_WORD_RE.test(text)) notes.push({ at: t.start, reason: "a `while` / `do` inside a template literal's `${ … }`, a nested `${ … }` or markup written in code — this rule does not enter it; rewrite it by hand (§49.4.1)" });
      continue;
    }
    const prev = toks[i - 1];
    if (prev && (isP(prev, ".") || isP(prev, "?."))) continue; // a member named `while` / `do`
    if (isKw(t, "while")) {
      // the `while (c)` tail of a `do { … } while (c)` belongs to its `do`
      if (prev && isP(prev, "}") && isKw(toks[match.get(i - 1) - 1], "do")) continue;
      if (!want.while) continue;
      const open = i + 1;
      if (!isP(toks[open], "(")) { notes.push({ rule: WHILE_RULE, at: t.start, reason: "`while` without a parenthesized head — left as written" }); continue; }
      const close = match.get(open);
      if (!isP(toks[close + 1], "{")) {
        notes.push({ rule: WHILE_RULE, at: t.start, reason: "a braceless `while (…) statement` — a `for` body is braced (§49.2.1 `loop-body`); brace it, then `scrml fix` rewrites it" });
        continue;
      }
      const bad = headHazard(toks, match, open, close);
      if (bad) { notes.push({ rule: WHILE_RULE, at: t.start, reason: `the \`while\` head ${bad} — as a \`for\` head it would not read as a condition (§49.2.1); rewrite it by hand` }); continue; }
      const kw = { start: t.start, end: t.end };
      const o = toks[open];
      const c = toks[close];
      // impl#1 drops the quotes of a string literal (and the delimiters of a template) in ANY C-style
      // `for` head (measured S481: `for (; s.charAt(i) != "x"; )` emits `… , x)`, `== ""` emits invalid
      // JS; known gap g-impl1-c-for-head-template-and-string-literals-mangled-s470). A head holding a
      // literal of that kind is spelled with the test moved to the top of the body instead —
      // `for (;;) { if (!(cond)) { break; } … }` — the same loop (a `continue` re-enters at the test).
      const literalHead = toks.slice(open + 1, close).some((x) => x.kind === "STRING" || x.kind === "REGEX" || x.kind === "BLOCK_REF" || x.kind === "MARKUP");
      let probe = [{ ...kw, text: "for" }, { start: o.end, end: o.end, text: "; " }, { start: c.start, end: c.start, text: "; " }];
      if (literalHead) {
        // S482 (review MED-1 of #2046): the top-check moves the condition INTO the body's block
        // scope. A name the body declares at its TOP level would capture it — a TDZ ReferenceError
        // (`let` / `const` / `class`) or a different value (`function`). Refused, never rewritten.
        // (The ruled `for (cond)` output keeps the condition in the head; it is refused too, because
        // its verify compiles this same top-check spelling and could not prove it.)
        const capture = declCapture(source, toks.slice(close + 2, match.get(close + 1)), toks.slice(open + 1, close), { topOnly: true });
        if (capture) {
          notes.push({ rule: WHILE_RULE, at: t.start, reason: `a \`while\` whose head holds a string / template / regex literal is spelled with its test at the top of the body (\`for (;;) { if (!(cond)) { break; } … }\`, impl#1 mangles such a literal in a \`for\` head), and this body ${capture} — moved into the body, the condition would read the body's binding (a TDZ ReferenceError, or a different value); rename the body's binding or rewrite it by hand (§49.4.1)` });
          continue;
        }
        const bo = toks[close + 1];
        const first = toks[close + 2];
        const condText = source.slice(o.end, c.start).trim();
        const check = `if (!(${condText})) { break; }`;
        const eol = source.indexOf("\n", bo.end);
        const brOwnLine = eol >= 0 && blank(source, bo.end, eol);
        let ins;
        if (brOwnLine) {
          const bodyIndent = first && !isP(first, "}") && first.line > bo.line ? indentAt(source, first.start) : `${indentAt(source, bo.start)}    `;
          ins = { start: bo.end, end: bo.end, text: `\n${bodyIndent}${check}` };
        } else {
          ins = { start: bo.end, end: bo.end, text: ` ${check}` };
        }
        probe = [{ start: t.start, end: c.end, text: "for (;;)" }, ins];
      }
      sites.push({ rule: WHILE_RULE, at: t.start, out: [{ ...kw, text: "for" }], probe, topCheck: literalHead });
      continue;
    }
    if (isKw(t, "do")) {
      if (!want.doWhile) continue;
      const bodyOpen = i + 1;
      if (!isP(toks[bodyOpen], "{")) { notes.push({ rule: DO_WHILE_RULE, at: t.start, reason: "`do` without a braced body — left as written" }); continue; }
      const bodyClose = match.get(bodyOpen);
      const w = bodyClose + 1;
      if (!isKw(toks[w], "while") || !isP(toks[w + 1], "(")) { notes.push({ rule: DO_WHILE_RULE, at: t.start, reason: "a `do { … }` not followed by `while (…)` — left as written" }); continue; }
      const condOpen = w + 1;
      const condClose = match.get(condOpen);
      const semi = isP(toks[condClose + 1], ";") ? condClose + 1 : -1;
      const tailEnd = semi >= 0 ? toks[semi].end : toks[condClose].end;
      const bc = toks[bodyClose];
      if (!blank(source, bc.end, toks[w].start)) { notes.push({ rule: DO_WHILE_RULE, at: t.start, reason: "a comment between a `do { … }` body and its `while` — left as written; rewrite it by hand (§49.3.6)" }); continue; }
      const body = toks.slice(bodyOpen + 1, bodyClose);
      const cond = toks.slice(condOpen + 1, condClose);
      if (cond.length === 0) { notes.push({ rule: DO_WHILE_RULE, at: t.start, reason: "a `do … while ()` with an empty condition — left as written" }); continue; }
      if (body.some((x) => isKw(x, "continue"))) {
        notes.push({ rule: DO_WHILE_RULE, at: t.start, reason: "a `do … while` whose body holds a `continue` — §49.3.6 rewrites it as `for (let first = true; first || cond; first = false) { … }`, whose `||` needs a boolean condition (§42.4) this rule cannot check; rewrite it by hand" });
        continue;
      }
      const capture = declCapture(source, body, cond);
      if (capture) { notes.push({ rule: DO_WHILE_RULE, at: t.start, reason: `a \`do … while\` whose body ${capture} — moved into the body, the condition would read the body's binding; rewrite it by hand (§49.3.6)` }); continue; }
      const condText = source.slice(toks[condOpen].end, toks[condClose].start).trim();
      // The break check goes on its own line before the closing `}` (or inline for a one-line body).
      const lastBody = body[body.length - 1];
      const ownLine = blank(source, source.lastIndexOf("\n", bc.start - 1) + 1, bc.start) && source.lastIndexOf("\n", bc.start - 1) >= toks[bodyOpen].end;
      const check = `if (!(${condText})) { break; }`;
      let ins;
      const extraEdits = [];
      if (ownLine) {
        // `}` alone on its line: the check gets a line of its own, indented as the body's last line.
        const closeIndent = indentAt(source, bc.start);
        const lastIndent = lastBody && lastBody.line !== toks[bodyOpen].line ? indentAt(source, lastBody.start) : "";
        const extra = lastIndent.startsWith(closeIndent) && lastIndent.length > closeIndent.length ? lastIndent.slice(closeIndent.length) : "    ";
        ins = { start: bc.start, end: bc.start, text: `${extra}${check}\n${closeIndent}` };
      } else {
        const needSemi = lastBody && !isP(lastBody, ";") && !isP(lastBody, "{") && !isP(lastBody, "}");
        const sp = /\s/.test(source[bc.start - 1] ?? "") ? "" : " ";
        if (needSemi) extraEdits.push({ start: lastBody.end, end: lastBody.end, text: ";" });
        ins = { start: bc.start, end: bc.start, text: `${sp}${check} ` };
      }
      const tail = { start: bc.end, end: tailEnd, text: "" };
      const kw = { start: t.start, end: t.end };
      sites.push({
        rule: DO_WHILE_RULE, at: t.start,
        out: [{ ...kw, text: "for" }, ...extraEdits, ins, tail],
        probe: [{ ...kw, text: "for (;;)" }, ...extraEdits, ins, tail],
      });
    }
  }
}

/** Why the head `toks(open, close)` cannot become a `for` condition head (or null). */
function headHazard(toks, match, open, close) {
  if (close === open + 1) return "is empty";
  for (let k = open + 1; k < close; k++) {
    const x = toks[k];
    if (match.has(k) && OPEN[x.text]) { k = match.get(k); continue; }
    if (isP(x, ";")) return "holds a `;`";
    if ((x.kind === "KEYWORD" || x.kind === "IDENT") && (x.text === "in" || x.text === "of")) return `holds \`${x.text}\` at its top level`;
  }
  return null;
}

/** The keywords that open a binding in a `do` body (S481 review LOW-2: `lin` and `class` too). */
const DECL_WORDS = new Set(["let", "const", "var", "lin", "function", "fn", "class"]);
/** Keywords naming one thing (no declarator list). */
const ONE_NAME_WORDS = new Set(["function", "fn", "class"]);

/**
 * Does a declaration in the loop body capture a name the condition reads? A reason, or null.
 * EVERY declarator of a declaration is read (S481 review LOW-2: in `let x = n, done = f();` the second
 * name captures too): a declared name is the token after the keyword, or after a `,` at the
 * declaration's own bracket depth, up to a `;` at that depth or the end of its enclosing block. Reading
 * past a `;`-less statement end only finds more names — a refusal, the safe direction. A cell opener
 * written in code (`<done> = …`, `let <done = …/>`, one MARKUP token) names a cell the same way.
 *
 * The condition's names are its IDENT / `@` tokens, less a property name after `.` / `?.` (not a
 * binding read). A condition whose names this cannot read — a template holding `${ … }`, a block, or
 * markup — fails closed: then ANY declaration captures (S482).
 *
 * `topOnly` (S482, the `while` top-check): only declarations at the body's own top level count — the
 * block the condition moves into. One inside a nested block, a function body or a `for` head lives in a
 * scope of its own. In that mode a `${ }` / `^{ }` / `~{ }` / `!{ }` block at the top level fails
 * closed too (what it declares is not read here).
 */
function declCapture(source, body, cond, opts = {}) {
  const topOnly = opts.topOnly === true;
  const opaque = cond.some((x) => x.kind === "BLOCK_REF" || x.kind === "MARKUP"
    || (x.kind === "STRING" && source[x.start] === "`" && source.slice(x.start, x.end).includes("${")));
  const condNames = new Set(cond
    .filter((x, i) => (x.kind === "IDENT" || x.kind === "AT_IDENT") && !(i > 0 && (isP(cond[i - 1], ".") || isP(cond[i - 1], "?."))))
    .map((x) => x.text.replace(/^@/, "")));
  const reads = (nm) => opaque || condNames.has(nm);
  const why = (what) => (opaque
    ? `declares ${what}, and the condition holds a template / block / markup whose names this rule cannot read`
    : `declares ${what}, which the condition reads`);
  const named = (nm) => {
    if (!nm) return null;
    if (isP(nm, "{") || isP(nm, "[")) return "declares names by destructuring";
    if (nm.kind === "IDENT" && reads(nm.text)) return why(`\`${nm.text}\``);
    return null;
  };
  // A statement-leading `<name …` (a cell opener `<done> = …` / `<done = …/>`, read as code tokens or
  // as one MARKUP token) or a `let` / `const` before one.
  const cellAt = (k) => {
    const x = body[k];
    if (!x) return null;
    if (x.kind === "MARKUP") {
      const m = /^<\s*@?([A-Za-z_$][\w$]*)/.exec(source.slice(x.start, x.end));
      return m && reads(m[1]) ? why(`the cell \`${m[1]}\``) : null;
    }
    if (isP(x, "<") && body[k + 1] && body[k + 1].kind === "IDENT" && reads(body[k + 1].text)) return why(`the cell \`${body[k + 1].text}\``);
    return null;
  };
  let level = 0; // topOnly: the bracket depth of body[k] inside the body
  for (let k = 0; k < body.length; k++) {
    const x = body[k];
    const prev = body[k - 1];
    if (topOnly) {
      if (isP(x, "(") || isP(x, "[") || isP(x, "{")) { level++; continue; }
      if (isP(x, ")") || isP(x, "]") || isP(x, "}")) { level--; continue; }
      if (level > 0) continue;
      if (x.kind === "BLOCK_REF" && /^[$^~!]\{/.test(source.slice(x.start, x.start + 2))) {
        return `holds a \`${source.slice(x.start, x.start + 2)} … }\` block at its top level, whose declarations this rule does not read`;
      }
    }
    const lead = !prev || isP(prev, ";") || isP(prev, "{") || isP(prev, "}") || prev.line < x.line;
    if (lead) { const c = cellAt(k); if (c) return c; }
    // impl#1's tokenizer reads `var` as an IDENT (it is no scrml keyword); still a binding form here.
    if (!((x.kind === "KEYWORD" || (x.kind === "IDENT" && x.text === "var")) && DECL_WORDS.has(x.text))) continue;
    const cell = cellAt(k + 1);
    if (cell) return cell;
    const first = named(body[k + 1]);
    if (first) return first;
    if (ONE_NAME_WORDS.has(x.text)) continue;
    let depth = 0;
    for (let j = k + 1; j < body.length; j++) {
      const y = body[j];
      if (isP(y, "(") || isP(y, "[") || isP(y, "{")) depth++;
      else if (isP(y, ")") || isP(y, "]") || isP(y, "}")) { if (--depth < 0) break; }
      else if (depth === 0 && isP(y, ";")) break;
      else if (depth === 0 && isP(y, ",")) {
        const r = named(body[j + 1]);
        if (r) return r;
      }
    }
  }
  return null;
}

/** Every loop site in `source`, unverified. */
export function planLoops(filePath, source, want = { while: true, doWhile: true }) {
  const ls = lineStarts(source);
  const { regions, errors } = codeRegions(filePath, source);
  const sites = [];
  const notes = [];
  const queue = regions.map((r) => ({ start: r.start, end: r.end, children: r.children }));
  while (queue.length) {
    const r = queue.shift();
    let toks;
    try {
      toks = regionTokens(source, r.start, r.end, r.children, ls, []);
    } catch (e) {
      const text = source.slice(r.start, r.end);
      if (LOOP_WORD_RE.test(text)) {
        notes.push({ at: e instanceof UndelimitedMarkup ? e.at : r.start, reason: e instanceof UndelimitedMarkup
          ? "markup inside code whose end this rule cannot find — the loops around it are left as written"
          : `impl#1's tokenizer threw on this region (${String(e?.message ?? e).split("\n")[0]}) — its loops are left as written` });
      }
      continue;
    }
    if (toks.length === 0) continue;
    const nested = [];
    scanLoops(source, toks, want, sites, notes, nested);
    queue.push(...nested);
  }
  sites.sort((a, b) => a.at - b.at);
  return {
    sites: sites.map((s) => ({ ...s, line: lineAt(ls, s.at) })),
    notes: notes.map((x) => ({ ...x, line: lineAt(ls, x.at) })),
    errors,
  };
}

function applyEdits(source, edits) {
  let out = "";
  let cur = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start || a.end - b.end)) {
    out += source.slice(cur, e.start) + e.text;
    cur = e.end;
  }
  return out + source.slice(cur);
}

// ---------------------------------------------------------------------------
// The canonical loop shape (verify)
// ---------------------------------------------------------------------------

/**
 * A canonical `for` node. `for (;;) { if (!(c)) { break; } S }` folds to `for (; c; ) { S }` (the
 * top-check spelling of a `while` whose head holds a literal): a `continue` in S re-enters at the test
 * in both. Applied to every `for` the canonical shape builds, so both sides fold alike.
 */
function forNode(init, test, update, body) {
  const s0 = !init && !test && !update && body && body.type === "BlockStatement" ? body.body[0] : null;
  const brk = s0 && s0.type === "IfStatement" && !s0.alternate && s0.test && s0.test.type === "UnaryExpression" && s0.test.operator === "!"
    ? (s0.consequent.type === "BlockStatement" && s0.consequent.body.length === 1 ? s0.consequent.body[0] : s0.consequent) : null;
  if (brk && brk.type === "BreakStatement" && !brk.label) {
    const rest = body.body.slice(1);
    // S482 (review MED-1 of #2046): the fold holds only when the test reads no name the rest of the
    // body declares at its top level — there the test sits in the body's scope and would read that
    // binding (TDZ / a different value), where `for (; c; )` reads the enclosing one. Otherwise the
    // node stays as written, so the verify reports the two shapes as different loops.
    const declared = topLevelDeclared(rest);
    if (declared.size > 0 && [...namesRead(s0.test.argument)].some((nm) => declared.has(nm))) return { type: "ForStatement", init, test, update, body };
    return forNode(null, s0.test.argument, null, { type: "BlockStatement", body: rest });
  }
  return { type: "ForStatement", init, test, update, body };
}

/** The names a binding pattern binds (Identifier / Object / Array / Assignment / Rest patterns). */
function patternNames(p, out) {
  if (!p) return out;
  if (p.type === "Identifier") out.add(p.name);
  else if (p.type === "ObjectPattern") for (const q of p.properties) patternNames(q.type === "RestElement" ? q.argument : q.value, out);
  else if (p.type === "ArrayPattern") for (const q of p.elements) patternNames(q, out);
  else if (p.type === "AssignmentPattern") patternNames(p.left, out);
  else if (p.type === "RestElement") patternNames(p.argument, out);
  return out;
}

/** The names a statement list declares in its own block scope (and `var`s, hoisted — counted, to fail closed). */
function topLevelDeclared(stmts) {
  const out = new Set();
  for (let s of stmts) {
    while (s && s.type === "LabeledStatement") s = s.body;
    if (!s) continue;
    if (s.type === "VariableDeclaration") for (const d of s.declarations) patternNames(d.id, out);
    else if ((s.type === "FunctionDeclaration" || s.type === "ClassDeclaration") && s.id) out.add(s.id.name);
  }
  return out;
}

/** Every Identifier an expression mentions, less non-computed property names / keys (over-reads nested scopes: fails closed). */
function namesRead(e, out = new Set()) {
  if (Array.isArray(e)) { for (const x of e) namesRead(x, out); return out; }
  if (!e || typeof e !== "object") return out;
  if (e.type === "Identifier") { out.add(e.name); return out; }
  for (const k of Object.keys(e)) {
    if ((e.type === "MemberExpression" && k === "property" && !e.computed) || ((e.type === "Property" || e.type === "MethodDefinition" || e.type === "PropertyDefinition") && k === "key" && !e.computed)) continue;
    namesRead(e[k], out);
  }
  return out;
}

/**
 * Rewrite every loop of an acorn tree into one shape: `while (c) B` → `for (; c; ) B`, and
 * `do { S } while (c)` → `for (;;) { S if (!(c)) { break; } }` (a braced body only). Both sides of
 * the verify are rewritten, so a loop impl#1 emits unchanged compares equal to itself.
 */
export function canonicalLoops(ast) {
  const visit = (v) => {
    if (Array.isArray(v)) return v.map(visit);
    if (!v || typeof v !== "object") return v;
    const o = {};
    for (const k of Object.keys(v)) o[k] = visit(v[k]);
    if (o.type === "WhileStatement") return forNode(null, o.test, null, o.body);
    if (o.type === "DoWhileStatement" && o.body && o.body.type === "BlockStatement") {
      const check = {
        type: "IfStatement",
        test: { type: "UnaryExpression", operator: "!", prefix: true, argument: o.test },
        consequent: { type: "BlockStatement", body: [{ type: "BreakStatement", label: null }] },
        alternate: null,
      };
      return forNode(null, null, null, { type: "BlockStatement", body: [...o.body.body, check] });
    }
    if (o.type === "ForStatement") return forNode(o.init, o.test, o.update, o.body);
    if (o.type === "UnaryExpression") return { type: o.type, operator: o.operator, prefix: o.prefix, argument: o.argument };
    if (o.type === "IfStatement") return { type: o.type, test: o.test, consequent: o.consequent, alternate: o.alternate };
    if (o.type === "BreakStatement") return { type: o.type, label: o.label };
    if (o.type === "BlockStatement") return { type: o.type, body: o.body };
    return o;
  };
  return visit(ast);
}

const canonicalArtifact = (text) => normalizedArtifact(text, canonicalLoops);

// ---------------------------------------------------------------------------
// fixLoops
// ---------------------------------------------------------------------------

/**
 * Rewrite the retired `while` / `do…while` statements of ONE file to the S469 `for`.
 *
 * `interim: true` (INTERIM — PA decision S481, the self-host while impl#1 builds the bootstrap bundle)
 * writes the impl#1-compilable spelling — the very text the verify compiles: the counted head
 * `for (; cond; )` for a `while` (§49.2.1 `counted-head ::= for-init? ';' condition? ';' for-step?`),
 * `for (;;) { S if (!(c)) { break; } }` for a `do…while`. Both are ruled scrml the bootstrap accepts and
 * impl#1 compiles to the same JS (measured S481, #2043). A later pass renames `for (; c; )` to the
 * ruled fix-it `for (c)` once the bootstrap builds its own bundle (gap
 * g-selfhost-while-migration-blocked-s481).
 * @param {string} source
 * @param {{ filePath?: string, auxSources?: Record<string,string>, verify?: boolean, rules?: string[],
 *           inPlaceClean?: boolean, allowNonCompiling?: boolean, maxCompiles?: number, interim?: boolean }} [opts]
 * @returns {{ output: string, changed: boolean, edits: Array<{start:number,end:number,text:string,rule:string,detail:string}>,
 *             applied: Array<{rule:string,line:number,detail:string}>, blockers: Array<{rule:string,line:number,reason:string,snippet:string}> }}
 *   `edits` are offsets into `source` (fix-s66 merges them into its own edit list).
 */
export function fixLoops(source, opts = {}) {
  const filePath = opts.filePath ?? "input.scrml";
  const rules = new Set(opts.rules ?? LOOP_RULES);
  const want = { while: rules.has(WHILE_RULE), doWhile: rules.has(DO_WHILE_RULE) };
  const blockers = [];
  const none = { output: source, changed: false, edits: [], applied: [], blockers };
  if (!want.while && !want.doWhile) return none;
  const ls = lineStarts(source);
  const snippet = (line) => source.slice(ls[line - 1], ls[line] !== undefined ? ls[line] - 1 : source.length).trim().slice(0, 120);
  const plan = planLoops(filePath, source, want);
  for (const e of plan.errors) blockers.push({ rule: WHILE_RULE, line: 1, reason: e, snippet: "" });
  for (const x of plan.notes) blockers.push({ rule: x.rule ?? WHILE_RULE, line: x.line, reason: x.reason, snippet: snippet(x.line) });
  let sites = plan.sites;
  if (sites.length === 0) return none;

  if (opts.verify !== false) {
    const reader = makeReader(filePath, opts.auxSources, canonicalArtifact);
    try {
      const base = reader.read(source);
      if (base.errs.length > 0 && !opts.allowNonCompiling) {
        blockers.push({ rule: sites[0].rule, line: sites[0].line, reason: `${scratchRefusalReason(base.errs, filePath, source, opts.inPlaceClean)} — no loop rewritten`, snippet: snippet(sites[0].line) });
        return none;
      }
      let budget = opts.maxCompiles ?? 40;
      const same = (set) => {
        budget--;
        const r = reader.read(applyEdits(source, set.flatMap((s) => s.probe)));
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
        for (const s of rejected) blockers.push({ rule: s.rule, line: s.line, reason: "impl#1 reads this loop differently once rewritten (checked as the counted / `for (;;)` head it does read) — not rewritten; check by hand", snippet: snippet(s.line) });
        for (const s of untried) blockers.push({ rule: s.rule, line: s.line, reason: "not rewritten: the verify budget ran out before this loop could be checked on its own — run `scrml fix` on the file again", snippet: snippet(s.line) });
        sites = kept.sort((a, b) => a.at - b.at);
      }
    } catch (e) {
      blockers.push({ rule: sites[0].rule, line: sites[0].line, reason: `the verify compile threw: ${String(e?.message ?? e).split("\n")[0]} — no loop rewritten`, snippet: "" });
      return none;
    } finally {
      reader.done();
    }
  }
  if (sites.length === 0) return none;
  const interim = opts.interim === true;
  const detail = (s) => s.rule === WHILE_RULE
    ? (interim ? "`while` → `for` (INTERIM counted head `for (; cond; )`)" : "`while` → `for` (condition head)")
    : (interim ? "`do … while` → INTERIM body-first `for (;;) { … }`" : "`do … while` → body-first `for { … }`");
  const edits = sites.flatMap((s) => (interim ? s.probe : s.out).map((e) => ({ ...e, rule: s.rule, detail: detail(s) })));
  const output = applyEdits(source, edits);
  const applied = sites.map((s) => ({ rule: s.rule, line: s.line, detail: s.rule === WHILE_RULE
    ? (interim ? "`while (cond)` → `for (; cond; )` (INTERIM)" : "`while (cond)` → `for (cond)`")
    : (interim ? "`do { … } while (cond)` → `for (;;) { …; if (!(cond)) { break; } }` (INTERIM)" : "`do { … } while (cond)` → `for { …; if (!(cond)) { break; } }`") }));
  return { output, changed: output !== source, edits, applied, blockers };
}
