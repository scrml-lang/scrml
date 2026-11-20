/**
 * @module commands/fix-terminators
 * The `scrml fix` rules `stmt-semi` and `arm-comma` — the S469 statement-terminator and arm-separator
 * migration. change-id: s480-fix-dialect (Track M step 1).
 *
 * Rulings (user-voice-scrml.md, S469):
 *   - dpa-073 F1 (a) "`;` terminates": "`;` ends a statement; newlines are whitespace to an accepted
 *     program's grammar" — by codemod.
 *   - dpa-073 F3 (i) "Every statement": "`;` after every non-block statement including the last
 *     before `}` (`onclick={ @n = @n + 1; }`); block-like statements and closer-delimited items take
 *     none."
 *   - dpa-073 F2 (iii) + F2 (i): "the arm list is a comma list (`match x { .A :> 1, .B :> 2, }`), one
 *     spelling, trailing comma optional — under S452 one arm grammar for match arms, `!{}` handler arms
 *     and engine message arms"; "a `,` between every pair of arms, block arms included".
 *   - dpa-073 F5 "Bootstrap enforces": "a `scrml fix` rule inserts `;` and arm `,` at impl#1-legacy's
 *     parsed boundaries, verified by emit diff (identical JS modulo content hash)".
 *   - S480 "Track M first" (bootstrap census build order, item 1): the `scrml fix` work is impl#1
 *     (`compiler/src/commands/`), admitted as a bootstrap-build tool.
 *
 * ═══ WHERE IT LOOKS ═══
 *
 * impl#1's block splitter (splitBlocks) says where the code is — never a text scan:
 *   - every `${ … }` logic block. A block that is the file root's, or a direct child of `<program>`,
 *     `<page>`, `<effect>` or `<request>`, is a statement list. Any other `${ … }` is a markup
 *     interpolation: a lone expression there takes no `;` (it is a value), but a run of two or more
 *     statements, or a statement that starts with a keyword, is a statement list;
 *   - the bare code of a `<program>` / `<page>` body (S441: "a bare run at a program body top means the
 *     same as inside `${}`") — a non-blank text run directly in the element;
 *   - every event-handler attribute value written `on…={ … }` (a statement list, §5.2.3);
 *   - every `!{ … }` handler block met inside that code (an arm list).
 * impl#1's own logic tokenizer (tokenizeLogic) reads each region, so a string, a template literal, a
 * comment, a regex literal or a `?{}` / `#{}` / `^{}` block is one token and is never edited. Markup
 * nested in code (a `lift <li>…</li>`) is one value token. `^{}` meta, `~{}` test, `?{}` and `#{}`
 * blocks are never entered.
 *
 * ═══ WHERE A STATEMENT ENDS (impl#1-legacy's boundary) ═══
 *
 * A statement ends at a `;`, at the `}` that closes its list, or at a line break where impl#1's
 * newline boundary (ast-builder.js collectExpr, BUG-ASI-NEWLINE / §7.2.2 rule 2) ends it: the line
 * ends in a value (a name, `@cell`, literal, `)`, `]`, `}`, a value keyword, a postfix `++`/`--`)
 * — not in a rule-2 continuation token — and the next line starts a statement (a name, a keyword,
 * an `@cell`, `!`, `{`, a `<name>` declaration, markup, a block). A next line that starts with `.`,
 * an operator, `(`, `[` or a template continues the statement, as impl#1 reads it. `else` / `catch`
 * / `finally` continue an `if` / `try`.
 *
 * A `;` is inserted right after the statement's last token (before any trailing comment) unless the
 * statement is block-like (dpa-073 F3: `if`/`else`, `for`, `while`, a statement `match`, `given`,
 * `when … changes { … }`, `defer { … }`, a function declaration, `try`, `switch`, `transaction`, a
 * `type Name:kind = { … }` declaration) and ends with its own `}`. Not touched: a legacy reactive
 * declaration (`<x> = v`, `const <x> = v`, `let <x/>` — the §66 rules own them); a lone expression
 * that is a value (a markup interpolation, an arm block `{ e }` whose value is used, §18.5 / §7.2.2
 * rule 3); a `return` whose value would start on the next line (dpa-073 reads `return⏎expr;` as
 * returning `expr`, impl#1 may not — reported, never guessed).
 *
 * Arms: in a `match … { }` and a `!{ }` handler, an arm ends where the next arm's head begins — a
 * line (outside brackets) that carries an arm separator `:>` / `=>` / `->` — or at a `,`. A `,` is
 * inserted after every arm that another arm follows; the trailing `,` stays optional (left as
 * written).
 *
 * ═══ HOW IT VERIFIES ═══
 *
 * impl#1 compiles the file before and after, at the same path with its project beside it: the
 * diagnostic codes must be identical, and every emitted artifact (source maps aside) the same — JS
 * compared as its syntax tree (acorn; positions and empty statements aside, so a `;` impl#1 copies
 * verbatim into its emit does not count), everything else byte for byte, the build identity folded
 * (`normalizedArtifact`).
 * When the whole file fails the check, the edits are bisected and every edit that changes impl#1's
 * reading on its own is withdrawn and reported; the rest are kept (each kept group was verified).
 *
 * Idempotent: a terminated statement and a separated arm get no second edit, so a second run makes
 * no change.
 */

import { splitBlocks } from "../block-splitter.js";
import { tokenizeLogic, tokenizeAttributes } from "../tokenizer.ts";
import { compileScrml } from "../api.js";
import { captureTrailingContentWarnings } from "../expression-parser.ts";
import { errorSeverityCodes, scratchRefusalReason, writeScratchProject } from "./fix-verify-shared.js";
import { foldBuildIdentity } from "../codegen/build-identity.ts";
import { parse as acornParse } from "acorn";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

export const SEMI_RULE = "stmt-semi";
export const COMMA_RULE = "arm-comma";

/** Elements whose direct `${ … }` children (and bare body code) are statement lists. */
const STMT_PARENTS = new Set(["program", "page", "channel", "effect", "request"]);
/** Elements whose bare (non-blank) body text is code (S441 / §40.8 default-logic bodies). */
const CODE_BODY_PARENTS = new Set(["program", "page", "channel"]);
/** A file-root text run impl#1 lifts into logic (ast-builder.js BARE_DECL_RE / TOPLEVEL_STATE_DECL_RE). */
const ROOT_DECL_RE = /^\s*(?:export\s+)?(server\s+(?:fn|function)[*\s]|type\s+\w|fn[*\s]\w?|function[*\s]\w?|let\s+[A-Za-z_]|const\s+[A-Za-z_]|import\s+[{a-zA-Z_*"'])/;
const ROOT_STATE_DECL_RE = /^\s*(?:export\s+)?(?:const\s+)?<\s*[A-Za-z_][A-Za-z0-9_]*[^>]*>\s*(?:[=:]|<[A-Za-z_])/;

/** §7.2.2 rule 2 continuation tokens (ast-builder.js RULE2_CONTINUATION_TEXT / _WORDS). */
const CONT_TEXT = new Set([
  "+", "-", "*", "/", "%", "**", "==", "!=", "===", "!==", "<", ">", "<=", ">=",
  "&&", "||", "??", "&", "|", "^", "<<", ">>", ">>>",
  "=", "+=", "-=", "*=", "/=", "%=", "**=", "&&=", "||=", "??=", "&=", "|=", "^=", "<<=", ">>=", ">>>=",
  ".", "?.", ":", ",", "=>", ":>", "->", "!", "...", "::",
]);
const CONT_WORDS = new Set(["in", "instanceof", "is", "typeof", "new", "and", "or", "await", "void", "delete", "extends"]);
const VALUE_KEYWORDS = new Set(["true", "false", "null", "undefined", "this", "not", "some", "given", "super"]);
/** Words impl#1's tokenizer reserves that code also uses as plain names (`let i = from`). */
const CONTEXTUAL_WORDS = new Set(["from", "as", "of", "get", "set", "static", "async", "default", "env", "public", "using", "with", "navigate", "cleanup", "upload", "reset", "changes", "animationFrame", "broadcast", "disconnect", "partial"]);
/** Keywords whose following `{` (at the same nesting level) opens a statement list. */
const BODY_HEADS = new Set(["if", "for", "while", "function", "fn", "catch", "switch", "when"]);
/** Keywords whose IMMEDIATELY following `{` opens a statement list. */
const BODY_NEXT = new Set(["else", "try", "finally", "do", "defer", "transaction"]);
/** Leading words that make a statement block-like when it ends with its own `}`. */
const BLOCK_LIKE_HEADS = new Set(["if", "for", "while", "function", "fn", "when", "given", "defer", "try", "do", "switch", "transaction", "match", "partial"]);
/** Modifiers that may precede a block-like head (`export function`, `server fn`, `async function`). */
const HEAD_MODIFIERS = new Set(["export", "server", "async", "pure", "public", "default"]);
/** Words that cannot end a statement: their operand follows (possibly in a sibling block). */
const OPERAND_WORDS = new Set(["let", "const", "renders", "lift", "export", "fail", "import", "type", "fn", "function", "server", "lin"]);
/** Leading keywords that make a lone markup-interpolation statement a statement, not a value. */
const STMT_LEAD_WORDS = new Set(["const", "let", "function", "fn", "import", "export", "type", "server", "return", "lift", "fail", "break", "continue", "use", "lin", "throw"]);

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

function lineStarts(src) {
  const ls = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) ls.push(i + 1);
  return ls;
}
function lineAt(ls, off) {
  let lo = 0;
  let hi = ls.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ls[mid] <= off) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

// ---------------------------------------------------------------------------
// Regions (impl#1's block tree)
// ---------------------------------------------------------------------------

/**
 * The code regions of a file, from impl#1's block splitter.
 * @returns {{ regions: Array<{kind:string, start:number, end:number, children:object[], mode:string}>, errors: string[] }}
 */
export function codeRegions(filePath, source) {
  let bs;
  try {
    bs = captureTrailingContentWarnings(() => splitBlocks(filePath, source)).result;
  } catch (e) {
    return { regions: [], errors: [`impl#1's block splitter threw: ${String(e?.message ?? e).split("\n")[0]}`] };
  }
  const regions = [];
  const visit = (b, parent) => {
    if (!b || typeof b !== "object") return;
    const pTag = parent && parent.type === "markup" ? String(parent.name ?? "") : null;
    if (b.type === "logic" && b.raw && b.raw.startsWith("${") && b.raw.endsWith("}")) {
      const mode = parent === null || (pTag !== null && STMT_PARENTS.has(pTag)) ? "stmts" : "interp";
      regions.push({ kind: "logic", start: b.span.start + 2, end: b.span.end - 1, children: b.children ?? [], mode });
      // Markup nested in the block (or in a `!{ … }` inside it) is visited for its own regions.
      visitNestedMarkup(b);
      return;
    }
    if (b.type === "markup" || b.type === "state") {
      if (b.type === "markup") for (const r of handlerRegions(b)) regions.push(r);
      const codeBody = b.type === "markup" && CODE_BODY_PARENTS.has(String(b.name ?? ""));
      // A program / page body's bare code: one region per run of text and comments (a comment line
      // inside a multi-line statement must not cut it in two).
      let run = null;
      const flush = () => {
        if (run && /\S/.test(source.slice(run.start, run.end).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""))) {
          regions.push({ kind: "body", start: run.start, end: run.end, children: [], mode: "stmts" });
        }
        run = null;
      };
      for (const c of b.children ?? []) {
        if (codeBody && (c.type === "text" || c.type === "comment")) {
          if (run) run.end = c.span.end; else run = { start: c.span.start, end: c.span.end };
          continue;
        }
        flush();
        visit(c, b);
      }
      flush();
      return;
    }
    // sql / css / meta / test / foreign / error-effect at markup level / text / comment: not entered.
  };
  const visitNestedMarkup = (b) => {
    for (const c of b.children ?? []) {
      if (c.type === "markup" || c.type === "state") visit(c, b);
      else if (c.type === "error-effect") visitNestedMarkup(c);
    }
  };
  // The file root: impl#1 lifts a top-level text run that starts with a bare declaration (or a legacy
  // `<x> = …` declaration) into logic (ast-builder.js liftBareDeclarations, BARE_DECL_RE /
  // TOPLEVEL_STATE_DECL_RE) — a module file written without `${ }`. Such a run (text and comments,
  // up to the next block) is code.
  let rootRun = null;
  const flushRoot = () => {
    if (rootRun) {
      const text = source.slice(rootRun.start, rootRun.end).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
      if (ROOT_DECL_RE.test(text) || ROOT_STATE_DECL_RE.test(text)) regions.push({ kind: "body", start: rootRun.start, end: rootRun.end, children: [], mode: "stmts" });
    }
    rootRun = null;
  };
  for (const b of bs.blocks ?? []) {
    if (b.type === "text" || b.type === "comment") {
      if (rootRun) rootRun.end = b.span.end; else rootRun = { start: b.span.start, end: b.span.end };
      continue;
    }
    flushRoot();
    visit(b, null);
  }
  flushRoot();
  return { regions, errors: [] };
}

/** The `on…={ … }` attribute values of one markup block's opener. */
function handlerRegions(block) {
  let toks;
  try {
    toks = tokenizeAttributes(block.raw, block.span.start, block.span.line ?? 1, block.span.col ?? 1, "markup");
  } catch {
    return [];
  }
  const out = [];
  for (let i = 0; i + 2 < toks.length; i++) {
    const a = toks[i];
    const eq = toks[i + 1];
    const v = toks[i + 2];
    if (a.kind !== "ATTR_NAME" || eq.kind !== "ATTR_EQ" || v.kind !== "ATTR_BLOCK") continue;
    if (!/^on[a-z]/i.test(a.text)) continue;
    const s = v.span.start;
    const e = v.span.end;
    out.push({ kind: "handler", start: s + 1, end: e - 1, children: [], mode: "stmts", raw: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tokens of one region
// ---------------------------------------------------------------------------

/**
 * impl#1's logic tokens of `source[start, end)`, comments dropped, with markup children collapsed to
 * one MARKUP token each and `->` joined. Every token carries `start`, `end`, `line`, `endLine`.
 */
function regionTokens(source, start, end, children, ls) {
  // Markup is masked to identifier characters before the code is tokenized: markup text is not code
  // (`don't` would open a string), and the whole element is one value token. The splitter names some
  // markup inside code as child blocks; markup it leaves inline (`lift <li>…</li>`, `return <p/>`,
  // `:> <span/>`) is found as the tokens are read — a `<` glued to a tag name where an operand starts
  // (impl#1's lift / markup-value reading) — and the source is re-tokenized after it.
  const markups = (children ?? []).filter((c) => (c.type === "markup" || c.type === "state") && c.span.start >= start && c.span.end <= end)
    .map((c) => ({ start: c.span.start, end: c.span.end }));
  const chars = source.slice(start, end).split("");
  const mask = (s, e) => { for (let k = s; k < e; k++) if (chars[k - start] !== "\n") chars[k - start] = "_"; };
  for (const m of markups) mask(m.start, m.end);
  const refs = (children ?? []).filter((c) => !(c.type === "markup" || c.type === "state"));
  const out = [];
  let from = start;
  let guard = 0;
  restart: while (from < end && guard++ < 10000) {
    const content = chars.slice(from - start).join("");
    const raw = tokenizeLogic(content, from, lineAt(ls, from), 1, refs.filter((c) => c.span.start >= from));
    for (let k = 0; k < raw.length; k++) {
      const t = raw[k];
      if (t.kind === "EOF" || t.kind === "COMMENT") continue;
      const s = t.span.start;
      const e = t.span.end;
      const m = markups.find((mk) => s >= mk.start && s < mk.end);
      if (m) {
        const last = out[out.length - 1];
        if (last && last.kind === "MARKUP" && last.start === m.start) continue;
        out.push({ kind: "MARKUP", text: "<markup>", start: m.start, end: m.end, line: lineAt(ls, m.start), endLine: lineAt(ls, m.end - 1) });
        continue;
      }
      const prev = out[out.length - 1];
      if (t.text === "<" && t.kind === "PUNCT" && inlineMarkupAt(source, s, prev, out, lineAt(ls, s))) {
        const me = scanMarkup(source, s, end);
        if (me > s) {
          markups.push({ start: s, end: me });
          mask(s, me);
          out.push({ kind: "MARKUP", text: "<markup>", start: s, end: me, line: lineAt(ls, s), endLine: lineAt(ls, me - 1) });
          from = me;
          continue restart;
        }
        // Markup whose end this reader cannot find (a closer form it does not know): the region's
        // statement boundaries are not known — nothing in it is touched.
        throw new UndelimitedMarkup(s);
      }
      if (prev && prev.text === "-" && t.text === ">" && prev.end === s) {
        prev.text = "->"; prev.end = e; prev.kind = "OPERATOR";
        continue;
      }
      let child = t.kind === "BLOCK_REF" ? refs.find((c) => c.span.start === s) ?? null : null;
    // impl#1's tokenizer reads a `!{ … }` the splitter left inline (in bare program-body code, a
    // handler attribute) as one BLOCK_REF: its body is an arm list all the same
    if (t.kind === "BLOCK_REF" && !child && source.startsWith("!{", s) && source[e - 1] === "}") child = { type: "error-effect", span: { start: s, end: e }, children: [] };
      // A literal's text never reads as punctuation or a keyword (`"}"`, `"match"` are values).
      const text = t.kind === "STRING" || t.kind === "BLOCK_REF" ? `\u0000${t.kind}` : t.text;
      out.push({ kind: t.kind, text, start: s, end: e, line: lineAt(ls, s), endLine: lineAt(ls, Math.max(s, e - 1)), child });
    }
    break;
  }
  return out;
}

/**
 * Is the `<` at `s` the start of an inline markup element? It is glued to a tag name, it stands where
 * an operand starts (after `lift` / `return`, an operator, an opener, or at a statement start), and it
 * is not a legacy reactive declaration `<x> = …` / `<x>: T = …` (the §66 rules' business).
 */
function inlineMarkupAt(source, s, prev, out, line) {
  if (!/[A-Za-z_]/.test(source[s + 1] ?? "")) return false;
  const operandPos = !prev || prev.text === "lift" || prev.text === "return" || !endsValue(prev, out[out.length - 2]);
  if (!operandPos) return false;
  const declHead = !prev || prev.text === ";" || prev.text === "{" || prev.text === "}" || prev.text === "const" || prev.text === "let" || prev.text === "export";
  if (declHead && /^<\s*[A-Za-z_][\w]*[^>\n]*>\s*(=(?!=)|:(?!>))/.test(source.slice(s, s + 300))) return false;
  if (prev && prev.endLine < line && /^<\s*[A-Za-z_][\w]*[^>\n]*>\s*(=(?!=)|:(?!>))/.test(source.slice(s, s + 300))) return false;
  return true;
}

class UndelimitedMarkup extends Error {
  constructor(at) { super("markup inside code whose end cannot be found"); this.at = at; }
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Past a quoted string / template at i (src[i] is the quote), or -1. */
function skipQuoted(src, i, limit) {
  const q = src[i];
  let j = i + 1;
  while (j < limit) {
    const c = src[j];
    if (c === "\\") { j += 2; continue; }
    if (q === "`" && c === "$" && src[j + 1] === "{") { j = skipBraced(src, j + 1, limit); if (j < 0) return -1; continue; }
    if (c === q) return j + 1;
    j++;
  }
  return -1;
}
/** Past the balanced `{ … }` / `( … )` / `[ … ]` group opening at i, or -1. */
function skipBraced(src, i, limit) {
  const open = src[i];
  const close = open === "{" ? "}" : open === "(" ? ")" : "]";
  let d = 0;
  let j = i;
  while (j < limit) {
    const c = src[j];
    if (c === "\"" || c === "'" || c === "`") { j = skipQuoted(src, j, limit); if (j < 0) return -1; continue; }
    if (c === "/" && src[j + 1] === "/") { const nl = src.indexOf("\n", j); j = nl < 0 ? limit : nl; continue; }
    if (c === "/" && src[j + 1] === "*") { const ce = src.indexOf("*/", j + 2); if (ce < 0) return -1; j = ce + 2; continue; }
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return j + 1; }
    j++;
  }
  return -1;
}
/** The end of the markup element whose `<` is at `pos` (its closer or `/>`), or -1. */
function scanMarkup(src, pos, limit, depth = 0) {
  if (depth > 200) return -1;
  const m = /^[A-Za-z_][\w:.-]*/.exec(src.slice(pos + 1, pos + 200));
  if (!m) return -1;
  const name = m[0];
  let i = pos + 1 + name.length;
  for (;;) {
    if (i >= limit) return -1;
    const c = src[i];
    if (c === "\"" || c === "'") { i = skipQuoted(src, i, limit); if (i < 0) return -1; continue; }
    if (c === "{" || c === "(" || c === "[") { i = skipBraced(src, i, limit); if (i < 0) return -1; continue; }
    if (c === "/" && src[i + 1] === ">") return i + 2;
    if (c === ">") { i++; break; }
    i++;
  }
  if (VOID_ELEMENTS.has(name.toLowerCase())) return i;
  while (i < limit) {
    const c = src[i];
    if (c === "<") {
      if (src[i + 1] === "/") {
        const cm = /^<\/\s*([A-Za-z_][\w:.-]*)?\s*>/.exec(src.slice(i, i + 200));
        if (!cm) return -1;
        return i + cm[0].length;
      }
      if (/[A-Za-z_]/.test(src[i + 1] ?? "")) { const e = scanMarkup(src, i, limit, depth + 1); if (e < 0) return -1; i = e; continue; }
      i++;
      continue;
    }
    if ((c === "$" || c === "#" || c === "?" || c === "^" || c === "!" || c === "~") && src[i + 1] === "{") { i = skipBraced(src, i + 1, limit); if (i < 0) return -1; continue; }
    i++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

const isKw = (t, w) => !!t && (t.kind === "KEYWORD" || t.kind === "IDENT") && t.text === w;
const isP = (t, p) => !!t && (t.kind === "PUNCT" || t.kind === "OPERATOR") && t.text === p;

/** Does `last` (with `prev` before it) end a value at a line end (impl#1's lastEndsValue)? */
function endsValue(last, prev) {
  if (!last) return false;
  const k = last.kind;
  const x = last.text;
  if (k === "IDENT") return !CONT_WORDS.has(x);
  if (k === "NUMBER" || k === "STRING" || k === "AT_IDENT" || k === "BLOCK_REF" || k === "MARKUP") return true;
  if (k === "KEYWORD") {
    if (prev && (prev.text === "." || prev.text === "?.")) return true;
    return VALUE_KEYWORDS.has(x) || CONTEXTUAL_WORDS.has(x) || x === "break" || x === "continue" || x === "return";
  }
  if (x === ")" || x === "]" || x === "}") return true;
  // a `?` glued to its operand is §19.5 propagation (postfix): it ends the expression (§7.2.2 rule 4)
  if (x === "?" && prev && prev.end === last.start) return true;
  if ((x === "++" || x === "--") && prev && prev.endLine === last.line &&
      (prev.kind === "IDENT" || prev.kind === "AT_IDENT" || prev.text === ")" || prev.text === "]")) return true;
  return false;
}

/** Does `last` continue the expression onto the next line (§7.2.2 rule 2)? */
function continues(last, prev) {
  if (!last) return true;
  if ((last.kind === "PUNCT" || last.kind === "OPERATOR") && CONT_TEXT.has(last.text)) {
    // A postfix `++` / `--` is not in the set; `>` closing a generic is rare in statements.
    return true;
  }
  if ((last.kind === "KEYWORD" || last.kind === "IDENT") && CONT_WORDS.has(last.text) && !(prev && (prev.text === "." || prev.text === "?."))) return true;
  if (last.text === "?") return !(prev && prev.end === last.start);
  return false;
}

/** Does `t`, first on its line, start a new statement (impl#1's tokStartsStmt, widened to its other breaks)? */
function startsStatement(t) {
  if (!t) return false;
  switch (t.kind) {
    case "IDENT": return !CONT_WORDS.has(t.text);
    case "KEYWORD": return !CONT_WORDS.has(t.text) && t.text !== "else" && t.text !== "catch" && t.text !== "finally";
    case "AT_IDENT":
    case "MARKUP":
    case "BLOCK_REF":
      return true;
    default:
      return t.text === "!" || t.text === "{" || t.text === "<" || t.text === "++" || t.text === "--";
  }
}

/**
 * Plan the edits of one region. `edits` gets `{ at, text, rule }`; `notes` gets `{ at, reason }`.
 */
function scanRegion(toks, mode, edits, notes, want, probe = null) {
  const n = toks.length;
  const T = (i) => (i >= 0 && i < n ? toks[i] : null);

  /**
   * Walk an expression from i until `stop(i)`; nested groups and braces are walked whole. Returns the
   * index where it stopped and the facts the caller needs about what it walked.
   * ctx: { stmtLevel: boolean, stmtStart: number, valueDefault: boolean }
   */
  function walk(i, stop, ctx) {
    let pending = null;   // { kind: "stmts"|"arms", value: boolean, immediate?: boolean }
    let chainValue = ctx.valueDefault;
    let lastBody = false; // the last token walked is the `}` of a statement list / arm list
    let sawAssign = false;
    const start = i;
    while (i < n && !stop(i)) {
      const t = toks[i];
      const prevSig = T(i - 1);
      lastBody = false;
      // `else` / `try` / … open a body only when the `{` follows at once
      if (pending && pending.immediate && t.text !== "{" && t.text !== "if") pending = null;
      if (t.text === "(" || t.text === "[") {
        const close = t.text === "(" ? ")" : "]";
        // (a `}` at the group's own level is an unbalanced region: the walk stops there, `bad`)
        const r = walk(i + 1, (j) => toks[j].text === close || toks[j].text === "}", { stmtLevel: false, stmtStart: -1, valueDefault: true });
        if (r.bad) return { i: r.i, lastBody, sawAssign, bad: true };
        i = r.i;
        if (T(i) && T(i).text === close) i++;
        else return { i, lastBody, sawAssign, bad: true };
        // `if (…)` / `for (…)` / `while (…)` / `catch (…)` / `switch (…)`: the body `{` follows the
        // head's group at once — anything else is a braceless body (`if (c) return { a: 1 }`)
        if (pending && pending.afterGroup) { pending.afterGroup = false; pending.immediate = true; }
        continue;
      }
      if (t.text === "{" && (t.kind === "PUNCT")) {
        let kind = "expr";
        let value = true;
        if (pending) { kind = pending.kind; value = pending.value; pending = null; }
        else if (prevSig && (prevSig.text === "=>")) { kind = "stmts"; value = false; }
        else if (prevSig && prevSig.text === ":>") { kind = armBraceIsObject(i) ? "expr" : "stmts"; value = ctx.armValue ?? true; }
        else if (ctx.stmtLevel && i === ctx.stmtStart) { kind = "stmts"; value = false; }
        if (kind === "stmts") {
          const r = stmtList(i + 1, value);
          i = r;
          if (!(T(i) && T(i).text === "}")) return { i, lastBody, sawAssign, bad: true };
          i++;
          lastBody = true;
          continue;
        }
        if (kind === "arms") {
          const r = armList(i + 1, value);
          i = r;
          if (!(T(i) && T(i).text === "}")) return { i, lastBody, sawAssign, bad: true };
          i++;
          lastBody = true;
          continue;
        }
        const r = walk(i + 1, (j) => toks[j].text === "}" || toks[j].text === ")" || toks[j].text === "]", { stmtLevel: false, stmtStart: -1, valueDefault: true });
        if (r.bad) return { i: r.i, lastBody, sawAssign, bad: true };
        i = r.i;
        if (!(T(i) && T(i).text === "}")) return { i, lastBody, sawAssign, bad: true };
        i++;
        continue;
      }
      if (t.kind === "BLOCK_REF" && t.child && t.child.type === "error-effect") {
        const value = !ctx.stmtLevel || sawAssign || leadsWithValueWord(ctx.stmtStart);
        errorEffect(t.child, value);
        i++;
        continue;
      }
      // a `!{ … }` the splitter left inline (in a handler attribute): `!` glued to `{` opens arms
      if (t.text === "!" && T(i + 1) && T(i + 1).text === "{" && T(i + 1).start === t.end) {
        pending = { kind: "arms", value: !ctx.stmtLevel || sawAssign || leadsWithValueWord(ctx.stmtStart) };
        i++;
        continue;
      }
      const afterDot = prevSig && (prevSig.text === "." || prevSig.text === "?.");
      if (!afterDot && (t.kind === "KEYWORD" || t.kind === "IDENT")) {
        if (t.text === "if") {
          // a statement `if` (first in its statement) has statement-list branches; any other `if` is
          // a value `if` (§17.6), whose `{ e }` branch is its expression. `else if` keeps the chain's.
          if (!(prevSig && isKw(prevSig, "else"))) chainValue = !(ctx.stmtLevel && i === ctx.stmtStart);
          pending = { kind: "stmts", value: chainValue, afterGroup: T(i + 1) && T(i + 1).text === "(" };
        } else if (t.text === "else") {
          pending = { kind: "stmts", value: chainValue, immediate: true };
        } else if (t.text === "match") {
          pending = { kind: "arms", value: !(ctx.stmtLevel && (i === ctx.stmtStart || (isKw(T(i - 1), "partial") && i - 1 === ctx.stmtStart))) };
        } else if (BODY_HEADS.has(t.text)) {
          const grouped = (t.text === "for" || t.text === "while" || t.text === "catch" || t.text === "switch") && T(i + 1) && T(i + 1).text === "(";
          pending = { kind: "stmts", value: false, afterGroup: grouped };
        } else if (pending && !pending.immediate && (t.text === "return" || t.text === "lift" || t.text === "fail" || t.text === "break" || t.text === "continue")) {
          // a statement word before any `{`: the head had a braceless body
          pending = null;
        } else if (BODY_NEXT.has(t.text) && T(i + 1) && T(i + 1).text === "{") {
          pending = { kind: "stmts", value: false, immediate: true };
        }
      }
      if (t.text === "=" && t.kind === "PUNCT") sawAssign = true;
      i++;
    }
    return { i, lastBody, sawAssign, start };
  }

  /** Does the statement starting at `s` lead with a word whose operand is a value? */
  function leadsWithValueWord(s) {
    const t = T(s);
    return !!t && (t.text === "const" || t.text === "let" || t.text === "return" || t.text === "lift" || t.text === "fail" || t.text === "lin");
  }

  /** At an arm body `{` (index i): does the brace read as an object literal (§18.5 armObjectShape)? */
  function armBraceIsObject(i) {
    const a = T(i + 1);
    const b = T(i + 2);
    if (!a) return false;
    if (a.text === "}") return false;
    if ((a.kind === "IDENT" || a.kind === "STRING" || a.kind === "NUMBER" || a.kind === "KEYWORD") && b && (b.text === ":" || b.text === ",")) return true;
    if (a.kind === "IDENT" && b && b.text === "}") return true; // `{ foo }` — ambiguous shorthand: left as written
    if (a.text === "...") return true;
    return false;
  }

  /** One statement from s. Returns { end, last, terminated, legacy, blockLike, retSplit }. */
  function statement(s, closer) {
    const head = T(s);
    // a legacy `<x> = v` / `const <x> = v`, or a §66 declaration (`let <x:T=v/>`, `renders <…>`):
    // a declaration, not a statement — the §66 rules / the ruled form own it, no `;`
    const legacy = (head.text === "<" && T(s + 1) && (T(s + 1).kind === "IDENT" || T(s + 1).kind === "KEYWORD"))
      || ((head.text === "const" || head.text === "let" || head.text === "renders") && T(s + 1) && (T(s + 1).text === "<" || T(s + 1).kind === "MARKUP"));
    let retSplit = false;
    const r = walk(s, (j) => {
      const t = toks[j];
      if (t.text === ";" || (closer && t.text === "}")) return true;
      if (j === s) return false;
      const last = toks[j - 1];
      if (t.line <= last.endLine) return false;
      if (continues(last, T(j - 2))) return false;
      if (!startsStatement(t)) return false;
      if (!endsValue(last, T(j - 2))) return false;
      if (last.text === "return" && j - 1 === s) retSplit = true;
      return true;
    }, { stmtLevel: true, stmtStart: s, valueDefault: false });
    const end = r.i;
    const lastTok = T(end - 1);
    const terminated = !!(T(end) && T(end).text === ";");
    let h = s;
    while (T(h) && HEAD_MODIFIERS.has(T(h).text) && T(h + 1) && (T(h + 1).kind === "KEYWORD" || T(h + 1).kind === "IDENT")) h++;
    const hw = T(h);
    let blockLike = false;
    if (lastTok && lastTok.text === "}" && hw) {
      // (its own body's `}` — not an object literal ending a braceless body: `if (c) return { a: 1 }`)
      if ((BLOCK_LIKE_HEADS.has(hw.text) || hw.text === "else") && r.lastBody) blockLike = true;
      // `type Name:kind = { … }` — a closer-delimited declaration (an alias `type A = T` takes `;`)
      if (hw.text === "type" && T(h + 2) && T(h + 2).text === ":") blockLike = true;
      // a bare block statement `{ … }`
      if (hw.text === "{") blockLike = true;
    }
    return { start: s, end, last: lastTok, terminated, legacy, blockLike, retSplit, bad: !!r.bad, head: hw };
  }

  /** A statement list from i up to its closing `}` (or the region end). Returns the index of the `}`. */
  function stmtList(i, valuePos, top) {
    const stmts = [];
    let bad = false;
    while (i < n && toks[i].text !== "}") {
      if (toks[i].text === ";") { i++; continue; }
      const st = statement(i, true);
      stmts.push(st);
      if (st.bad) { bad = true; i = st.end; break; }
      i = st.end > i ? st.end : i + 1;
      if (st.terminated) i++;
    }
    if (bad) {
      notes.push({ at: toks[Math.min(stmts[stmts.length - 1]?.start ?? i, n - 1)].start, reason: "a region impl#1's tokens do not balance in — left as written" });
      return i;
    }
    if (top && probe) probe.push(...stmts);
    // Which statements owe a `;`.
    const lone = stmts.length === 1 && !stmts[0].terminated && !stmts[0].legacy && !stmts[0].blockLike &&
      !(stmts[0].head && STMT_LEAD_WORDS.has(T(stmts[0].start).text));
    for (const st of stmts) {
      if (st.terminated || st.legacy || st.blockLike || !st.last) continue;
      // a statement that runs on past its region (`const C = ` before a markup sibling) is not ended here
      if (continues(st.last, T(st.end - 2))) continue;
      // nor one that ends in a word that takes an operand (`let` / `renders` before a markup sibling
      // the splitter cut off: `let <x:T=v/>` in a program body is a §66 declaration)
      if (OPERAND_WORDS.has(st.last.text) && toks.slice(st.start, st.end).every((x) => OPERAND_WORDS.has(x.text) || HEAD_MODIFIERS.has(x.text))) continue;
      if (lone && (valuePos || top === "interp")) continue;
      if (st.retSplit) { notes.push({ at: st.start, reason: "a `return` whose value starts on the next line — dpa-073 reads `return⏎expr;` as returning `expr`; left for a human" }); continue; }
      if (want.semi) edits.push({ at: st.last.end, text: ";", rule: SEMI_RULE });
    }
    return i;
  }

  /** An arm list from i up to its closing `}`. Returns the index of the `}`. */
  function armList(i, valuePos) {
    const arms = [];
    while (i < n && toks[i].text !== "}") {
      if (toks[i].text === ",") { i++; continue; }
      const a = arm(i, valuePos);
      if (a.bad) {
        notes.push({ at: toks[i].start, reason: "an arm list whose arms cannot be placed (no `:>` / `=>` / `->` where an arm head is expected) — left as written" });
        // skip to the list's closer
        let d = 0;
        while (i < n) {
          const x = toks[i].text;
          if (x === "{" || x === "(" || x === "[") d++;
          else if (x === "}" || x === ")" || x === "]") { if (d === 0) break; d--; }
          i++;
        }
        return i;
      }
      arms.push(a);
      i = a.end;
      if (T(i) && T(i).text === ",") { a.comma = true; i++; }
    }
    for (let k = 0; k + 1 < arms.length; k++) {
      if (!arms[k].comma && want.comma) edits.push({ at: arms[k].last.end, text: ",", rule: COMMA_RULE });
    }
    return i;
  }

  /**
   * The index of the arm separator of the arm head starting at i (outside brackets), or -1. The head
   * is on i's line; it runs on to the next line only after a trailing `|` (an alternation pattern
   * written over several lines).
   */
  function armSepOnLine(i) {
    let line = toks[i].line;
    let d = 0;
    for (let j = i; j < n; j++) {
      if (toks[j].line !== line) {
        if (!(j > i && toks[j - 1].text === "|" && d === 0)) return -1;
        line = toks[j].line;
      }
      const x = toks[j].text;
      if (x === "(" || x === "[" || x === "{") d++;
      else if (x === ")" || x === "]" || x === "}") { if (d === 0) return -1; d--; }
      else if (d === 0 && (x === ":>" || x === "=>" || x === "->")) return j;
    }
    return -1;
  }

  function arm(i, valuePos) {
    const sep = armSepOnLine(i);
    if (sep < 0) return { bad: true };
    // the head: tokens i..sep (patterns, guards) — groups inside are balanced on the line
    let j = sep + 1;
    if (T(j) && T(j).text === "{" && !armBraceIsObject(j)) {
      const close = stmtList(j + 1, valuePos);
      if (!(T(close) && T(close).text === "}")) return { bad: true };
      return { end: close + 1, last: T(close) };
    }
    const r = walk(j, (k) => {
      const t = toks[k];
      if (t.text === "," || t.text === "}") return true;
      if (k === j) return false;
      const last = toks[k - 1];
      if (t.line <= last.endLine) return false;
      if (continues(last, T(k - 2))) return false;
      return armSepOnLine(k) >= 0;
    }, { stmtLevel: false, stmtStart: -1, valueDefault: true, armValue: valuePos });
    if (r.bad || r.i === j) return { bad: true };
    return { end: r.i, last: T(r.i - 1) };
  }

  function errorEffect(child, valuePos) {
    // A `!{ … }` handler's body: its own tokens, scanned as an arm list.
    nested.push({ child, valuePos });
  }

  const nested = [];
  const endIdx = stmtList(0, false, mode);
  if (endIdx < n && toks[endIdx].text === "}") notes.push({ at: toks[endIdx].start, reason: "an unbalanced `}` in a code region — the rest of the region is left as written" });
  return nested;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Every `;` / `,` the rules would insert in `source`, without verifying.
 * @returns {{ edits: Array<{at:number,text:string,rule:string,line:number}>, notes: Array<{at:number,line:number,reason:string}>, errors: string[] }}
 */
export function planTerminators(filePath, source, want = { semi: true, comma: true }) {
  const ls = lineStarts(source);
  const { regions, errors } = codeRegions(filePath, source);
  const edits = [];
  const notes = [];
  const queue = regions.map((r) => ({ ...r }));
  while (queue.length) {
    const r = queue.shift();
    let toks;
    try {
      toks = regionTokens(source, r.start, r.end, r.children, ls);
    } catch (e) {
      if (e instanceof UndelimitedMarkup) notes.push({ at: e.at, reason: "markup inside code whose end this rule cannot find (a closer form it does not read) — the statements around it are left as written" });
      else notes.push({ at: r.start, reason: `impl#1's tokenizer threw on this region (${String(e?.message ?? e).split("\n")[0]}) — left as written` });
      continue;
    }
    if (toks.length === 0) continue;
    if (r.kind === "arms") {
      // an `!{ … }` body: one arm list
      const sub = scanArms(toks, r.valuePos, edits, notes, want);
      for (const x of sub) queue.push(nestedRegion(x));
      continue;
    }
    const sub = scanRegion(toks, r.mode, edits, notes, want);
    for (const x of sub) queue.push(nestedRegion(x));
  }
  const seen = new Set();
  const out = [];
  for (const e of edits.sort((a, b) => a.at - b.at)) {
    if (seen.has(e.at)) continue;
    seen.add(e.at);
    out.push({ ...e, line: lineAt(ls, e.at) });
  }
  return { edits: out, notes: notes.map((x) => ({ ...x, line: lineAt(ls, x.at) })), errors };
}

function nestedRegion({ child, valuePos }) {
  return { kind: "arms", start: child.span.start + 2, end: child.span.end - 1, children: child.children ?? [], valuePos };
}

/** An arm-list region (a `!{ … }` body): wrap its tokens so the scanner reads them as one arm list. */
function scanArms(toks, valuePos, edits, notes, want) {
  const open = { kind: "PUNCT", text: "{", start: toks[0].start, end: toks[0].start, line: toks[0].line, endLine: toks[0].line };
  const last = toks[toks.length - 1];
  const close = { kind: "PUNCT", text: "}", start: last.end, end: last.end, line: last.endLine, endLine: last.endLine };
  // `match` + a synthetic subject-less brace: the arm list path of the scanner.
  const synth = [{ kind: "KEYWORD", text: "match", start: open.start, end: open.start, line: open.line, endLine: open.line }, open, ...toks, close];
  // valuePos: a statement-position handler's arm blocks are statement lists (§7.2.2 rule 1)
  if (valuePos) synth.unshift({ kind: "IDENT", text: "__v", start: open.start, end: open.start, line: open.line, endLine: open.line }, { kind: "PUNCT", text: "=", start: open.start, end: open.start, line: open.line, endLine: open.line });
  const myEdits = [];
  const sub = scanRegion(synth, "interp", myEdits, notes, want);
  // the synthetic statement's own `;` (after the synthetic `}`) is not an edit
  for (const e of myEdits) if (e.at !== close.end || e.text !== ";") edits.push(e);
  return sub;
}

// ---------------------------------------------------------------------------
// Verify (impl#1 compile, identical artifacts)
// ---------------------------------------------------------------------------

function applyEdits(source, edits) {
  let out = "";
  let cur = 0;
  for (const e of [...edits].sort((a, b) => a.at - b.at)) {
    out += source.slice(cur, e.at) + e.text;
    cur = e.at;
  }
  return out + source.slice(cur);
}

/**
 * One emitted artifact, as the verify compares it. The build identity (a content hash of the client
 * code, codegen/build-identity.ts) is folded back to its placeholder. An artifact that parses as
 * JavaScript is compared as its syntax tree — positions dropped, empty statements dropped — so a `;`
 * that impl#1 copies verbatim into its emit (a nested function body is emitted from its source text:
 * `return x }` → `return x ; }`) is the same JS, as the S469 F5 route asks ("identical JS"). Anything
 * else (HTML, CSS, a JS chunk acorn does not parse) is compared byte for byte.
 */
export function normalizedArtifact(text) {
  const folded = foldBuildIdentity(text);
  let ast;
  try {
    ast = acornParse(folded, { ecmaVersion: "latest", sourceType: "module", allowReturnOutsideFunction: true, allowImportExportEverywhere: true, allowAwaitOutsideFunction: true, allowHashBang: true });
  } catch {
    return folded;
  }
  return "js-ast:" + JSON.stringify(ast, (k, v) => {
    if (k === "start" || k === "end" || k === "loc" || k === "range") return undefined;
    if (Array.isArray(v)) return v.filter((x) => !(x && typeof x === "object" && x.type === "EmptyStatement"));
    return v;
  });
}

/** impl#1's reading of `text` compiled as `filePath` in a scratch copy of its project. */
function makeReader(filePath, auxSources) {
  const dir = mkdtempSync(join(tmpdir(), "scrml-fix-terminators-"));
  let target = null;
  const read = (text) => {
    if (target === null) target = writeScratchProject(dir, filePath, text, auxSources).target;
    writeFileSync(target, text);
    const saved = { log: console.log, warn: console.warn, error: console.error, out: process.stdout.write, err: process.stderr.write };
    let r;
    try {
      console.log = console.warn = console.error = () => {};
      process.stdout.write = process.stderr.write = () => true;
      r = captureTrailingContentWarnings(() => compileScrml({ inputFiles: [target], write: false, outputDir: join(dir, "out"), log: () => {} })).result;
    } finally {
      console.log = saved.log; console.warn = saved.warn; console.error = saved.error;
      process.stdout.write = saved.out; process.stderr.write = saved.err;
    }
    const codes = [...(r.errors ?? []), ...(r.warnings ?? [])].map((d) => d?.code).filter((c) => typeof c === "string").sort();
    const outputs = [];
    for (const [k, v] of r.outputs ?? new Map()) {
      const fields = {};
      for (const f of Object.keys(v ?? {}).sort()) if (!/Map$/.test(f) && typeof v[f] === "string") fields[f] = normalizedArtifact(v[f]);
      outputs.push([relative(dir, k), fields]);
    }
    outputs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return { codes: codes.join(","), outputs: JSON.stringify(outputs), errs: errorSeverityCodes(r) };
  };
  return { read, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// fixTerminators
// ---------------------------------------------------------------------------

/**
 * Insert the ruled `;` statement terminators and `,` arm separators into ONE file.
 * @param {string} source
 * @param {{ filePath?: string, auxSources?: Record<string,string>, verify?: boolean, rules?: string[],
 *           inPlaceClean?: boolean, allowNonCompiling?: boolean, maxCompiles?: number }} [opts]
 * @returns {{ output: string, changed: boolean, applied: Array<{rule:string,line:number,detail:string}>,
 *             blockers: Array<{rule:string,line:number,reason:string,snippet:string}> }}
 */
export function fixTerminators(source, opts = {}) {
  const filePath = opts.filePath ?? "input.scrml";
  const rules = new Set(opts.rules ?? [SEMI_RULE, COMMA_RULE]);
  const want = { semi: rules.has(SEMI_RULE), comma: rules.has(COMMA_RULE) };
  const blockers = [];
  const none = { output: source, changed: false, applied: [], blockers };
  if (!want.semi && !want.comma) return none;
  const ls = lineStarts(source);
  const snippet = (line) => (source.slice(ls[line - 1], ls[line] !== undefined ? ls[line] - 1 : source.length)).trim().slice(0, 120);
  const plan = planTerminators(filePath, source, want);
  for (const e of plan.errors) blockers.push({ rule: SEMI_RULE, line: 1, reason: e, snippet: "" });
  for (const x of plan.notes) blockers.push({ rule: SEMI_RULE, line: x.line, reason: x.reason, snippet: snippet(x.line) });
  let edits = plan.edits;
  if (edits.length === 0) return none;

  if (opts.verify !== false) {
    const reader = makeReader(filePath, opts.auxSources);
    try {
      const base = reader.read(source);
      if (base.errs.length > 0 && !opts.allowNonCompiling) {
        blockers.push({ rule: edits[0].rule, line: edits[0].line, reason: `${scratchRefusalReason(base.errs, filePath, source, opts.inPlaceClean)} — no \`;\` / \`,\` inserted`, snippet: snippet(edits[0].line) });
        return none;
      }
      let budget = opts.maxCompiles ?? 40;
      const same = (set) => {
        budget--;
        const r = reader.read(applyEdits(source, set));
        return r.codes === base.codes && r.outputs === base.outputs;
      };
      if (!same(edits)) {
        // Bisect: keep every group that verifies on its own (together with the groups kept so far).
        const kept = [];
        const rejected = [];   // isolated: this edit alone changes impl#1's reading
        const untried = [];    // the verify budget ran out before the edit's group was isolated
        const stack = [edits];
        while (stack.length) {
          const g = stack.pop();
          if (budget <= 0) { untried.push(...g); continue; }
          if (same([...kept, ...g])) { kept.push(...g); continue; }
          if (g.length === 1) { rejected.push(g[0]); continue; }
          const mid = g.length >> 1;
          stack.push(g.slice(mid), g.slice(0, mid));
        }
        for (const e of rejected) {
          blockers.push({ rule: e.rule, line: e.line, reason: `inserting \`${e.text}\` here changes impl#1's reading of the file (emitted artifacts or codes) — not inserted; check by hand`, snippet: snippet(e.line) });
        }
        for (const e of untried) {
          blockers.push({ rule: e.rule, line: e.line, reason: `not inserted: impl#1's reading of the file changed and the verify budget ran out before this \`${e.text}\` could be checked on its own — run \`scrml fix\` on the file again`, snippet: snippet(e.line) });
        }
        edits = kept;
        // the kept set as a whole was verified by the last successful `same` (it is cumulative)
      }
    } catch (e) {
      blockers.push({ rule: edits[0].rule, line: edits[0].line, reason: `the verify compile threw: ${String(e?.message ?? e).split("\n")[0]} — nothing inserted`, snippet: "" });
      return none;
    } finally {
      reader.done();
    }
  }
  if (edits.length === 0) return none;
  const output = applyEdits(source, edits);
  const applied = edits.map((e) => ({ rule: e.rule, line: e.line, detail: e.rule === SEMI_RULE ? "inserted `;`" : "inserted `,` between arms" }));
  return { output, changed: output !== source, applied, blockers };
}

/**
 * The top-level statements of the `${ … }` block whose `$` is at `blockStart` — exact extents, read
 * off the scanner's own boundaries (impl#1's newline boundary). Used by fix-s66's unwrap-logic to
 * split a block around its legacy declarations. Null when the block is not found or does not balance.
 * @returns {Array<{start:number,end:number,legacy:boolean,terminated:boolean}> | null}
 */
export function logicBlockStatements(filePath, source, blockStart) {
  const ls = lineStarts(source);
  const { regions } = codeRegions(filePath, source);
  const r = regions.find((x) => x.kind === "logic" && x.start === blockStart + 2);
  if (!r) return null;
  let toks;
  try {
    toks = regionTokens(source, r.start, r.end, r.children, ls);
  } catch {
    return null;
  }
  if (toks.length === 0) return [];
  const notes = [];
  const probe = [];
  scanRegion(toks, "stmts", [], notes, { semi: false, comma: false }, probe);
  if (notes.length > 0) return null;
  return probe.map((st) => ({
    start: toks[st.start].start,
    end: st.terminated ? toks[st.end].end : st.last.end,
    legacy: st.legacy,
    terminated: st.terminated,
  }));
}
