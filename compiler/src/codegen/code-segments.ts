// code-segments.ts
// ---------------------------------------------------------------------------
// Shared regex-literal / comment / string-aware code-segment splitter.
//
// GITI-017 (S124 → S125): scrml keyword-lowering passes (`not `→`!`,
// `not`→`null`, `is not`→null-check, etc.) operate as text substitutions over
// emitted/parsed source. Without a fence, those substitutions corrupt the
// INTERIOR of regex literals, comments, and string literals — a silent
// data-corruption class: the JS stays syntactically valid and runs, but the
// regex body / comment text is wrong (e.g. `/not a jj repo/i` → `/!a jj repo/i`).
//
// S124 (f181d60a) fenced the codegen pass (rewriteNotKeyword in rewrite.ts).
// S125 (this module) extracts that fence into a leaf module with NO project
// imports so BOTH rewrite.ts AND expression-parser.ts (preprocessForAcorn,
// which has its OWN unfenced `not`-lowering — the residual half of the bug)
// can share ONE implementation rather than maintaining parallel mechanisms.
// Leaf placement avoids the rewrite.ts ↔ expression-parser.ts import cycle.

// Keywords that may precede a regex literal in expression position. Per
// ECMA-262, `/` after one of these ends an "expression-prefix" context, so the
// `/` opens a regex (not division). The set is intentionally minimal — false
// negatives (treating a regex as division) only fail to MASK and risk
// re-introducing the corruption; false positives (treating a division as
// regex) would mask code we should rewrite. Erring minimal preserves
// correctness on division-heavy code.
const REGEX_PERMISSIVE_KEYWORDS = new Set([
  "return", "typeof", "void", "delete", "new", "in", "of",
  "instanceof", "throw", "yield", "await",
]);

/**
 * §S412 — the keywords whose parenthesised HEAD is followed by a STATEMENT, so that a
 * `/` after the closing `)` opens a REGEX rather than being division.
 *
 * ⚑ ONE DEFINITION, TWO CONSUMERS, AND THEY MUST NOT DRIFT. `regexAllowedAfter` below
 * uses it to decide whether the §59 map-literal preprocessor may walk into a regex
 * interior; `tokenizer.ts`'s `closesControlFlowHead` uses it to decide whether the regex
 * survives TOKENIZATION at all. The same source construct is classified by both, and a
 * disagreement is not a style problem — it reopens
 * `g-regex-char-class-colon-mislowered-as-map-literal` (the S406 82 GB lockup) in exactly
 * the contexts the other one newly admits.
 *
 * `catch` is included: `catch (e) /re/.test(e)` is a braceless catch body. `switch` is
 * included for completeness even though its body is always braced.
 */
export const REGEX_AFTER_CLOSE_PAREN_KEYWORDS: ReadonlySet<string> = new Set([
  "if", "for", "while", "switch", "catch",
]);

// Returns true if a `/` appearing immediately after `codeBefore` should be
// interpreted as the opener of a regex literal (rather than as division).
// `codeBefore` is the slice of source-text ending just before the `/`.
export function regexAllowedAfter(codeBefore: string): boolean {
  return regexAllowedAfterIn({
    length: codeBefore.length,
    ch: (k: number) => codeBefore[k],
    slice: (a: number, b: number) => codeBefore.slice(a, b),
  });
}

/**
 * The code before a `/`, as `regexAllowedAfterIn` reads it: indexable, sliceable, and — when
 * the reader keeps it — the matching `(` of a `)` (`openOf`). A plain string is one; so is
 * `CodeContext` below, which `rewriteCodeSegments` grows as it reads (S478 review F4).
 */
interface CodeBefore {
  readonly length: number;
  /** The character at `k` (callers only ask for `0 <= k < length`). */
  ch(k: number): string;
  slice(start: number, end: number): string;
  /** Index of the `(` matching the `)` at `k`, or -1 when it has none. Absent: walk back. */
  openOf?(k: number): number;
}

/**
 * The significant prefix `rewriteCodeSegments` hands the regex-vs-division decision, kept as a
 * growing character list instead of a re-built string (S478 review F4). Re-joining the prefix
 * (or flattening a `+=`-built rope) up to every `/` made the fence O(text) per `/` — quadratic
 * over a library block or a whole client file — and so did walking back over a long
 * parenthesised inside after every `)`. Each character is appended once; a `)` records its
 * matching `(` on the way in, so `openOf` is O(1). `regexAllowedAfterIn` gives the same answer
 * on it as on the equivalent string: the forward stack match and the backward depth walk pick
 * the same `(` (the text between is balanced either way), and both find none on an unmatched `)`.
 */
class CodeContext implements CodeBefore {
  private readonly chars: string[] = [];
  private readonly match: number[] = [];
  private readonly opens: number[] = [];

  get length(): number { return this.chars.length; }

  push(text: string): void {
    for (let x = 0; x < text.length; x++) {
      const c = text[x];
      const k = this.chars.length;
      if (c === "(") this.opens.push(k);
      else if (c === ")") this.match[k] = this.opens.length > 0 ? this.opens.pop()! : -1;
      this.chars.push(c);
    }
  }

  ch(k: number): string { return this.chars[k]; }
  slice(start: number, end: number): string { return this.chars.slice(start, end).join(""); }
  openOf(k: number): number { return this.match[k] ?? -1; }
}

function regexAllowedAfterIn(codeBefore: CodeBefore): boolean {
  // Strip trailing whitespace to find the last meaningful character.
  let i = codeBefore.length - 1;
  while (i >= 0 && /\s/.test(codeBefore.ch(i))) i--;
  // No prior code → expression start → regex.
  if (i < 0) return true;
  const lastCh = codeBefore.ch(i);
  // S440 f18 fix round — a trailing `++` / `--` is a POSTFIX update (`i++ / 2`):
  // it ends a value, so a following `/` is division. (A PREFIX `++` directly
  // before a regex, `++/re/`, is an early error in JS — a regex literal is not an
  // assignment target — so that reading never has to be preserved.)
  // JS lexes a contiguous run of `+` (or `-`) greedily into `++` pairs from the
  // left, so the run's PARITY decides what the last token is: even → it ends in
  // `++` (postfix, division); odd → it ends in a single binary/unary `+`
  // (`a+++/Q/.source` is `a++ + /Q/.source` — a regex). A run of 1 is the
  // ordinary operator case handled below.
  if (lastCh === "+" || lastCh === "-") {
    let run = 0;
    for (let r = i; r >= 0 && codeBefore.ch(r) === lastCh; r--) run++;
    if (run % 2 === 0) return false;
  }
  // After punctuation / operator → regex.
  // `}` is intentionally included: in JS it ends a block-statement (regex
  // follows) far more commonly than an object-literal in expression
  // position (where division would follow). Errs toward masking.
  if ("(,;:?[{=<>+-*%&|^!~}".includes(lastCh)) return true;
  // After identifier end → check for regex-permissive keyword.
  if (/[A-Za-z_$]/.test(lastCh)) {
    let j = i;
    while (j >= 0 && /[A-Za-z0-9_$]/.test(codeBefore.ch(j))) j--;
    const token = codeBefore.slice(j + 1, i + 1);
    // ⚑ S412 — `else` / `do` / `finally` introduce a STATEMENT, so a `/` after one
    // opens a regex. They are not in `REGEX_PERMISSIVE_KEYWORDS` because that set is
    // about EXPRESSION prefixes (`return /re/`, `typeof /re/`); these are the
    // statement-position limb of the same question.
    const isKeywordSpelling =
      token === "else" || token === "do" || token === "finally" || REGEX_PERMISSIVE_KEYWORDS.has(token);
    if (!isKeywordSpelling) return false;
    // ⚑ S440 f18 fix round 3 — a keyword SPELLING is only a keyword in keyword
    // POSITION. After `.` / `?.` it is a property name (`o.of / 2`, `x.do / 2`,
    // `o?.in / 2`) — a VALUE, so a following `/` divides. This holds for every
    // spelling, reserved or not (a reserved word is a legal property name).
    let p = j;
    while (p >= 0 && /\s/.test(codeBefore.ch(p))) p--;
    if (p >= 0 && codeBefore.ch(p) === ".") return false;
    // `of` is the one CONTEXTUAL spelling in the set that is also an ordinary
    // identifier in every mode (`const of = 8; of / 2`). It is the for-of
    // keyword only directly after the loop binding — an identifier, or a
    // destructuring pattern's `]` / `}` — so it is a keyword iff the previous
    // token is one of those (and that identifier is not itself a keyword, as in
    // `return of / 2`, where `of` is the variable). The reserved spellings (`in`,
    // `return`, `typeof`, `new`, `delete`, `void`, `instanceof`, `throw`, `else`,
    // `do`, `finally`) cannot be variables, so the `.` check is their only
    // non-keyword reading. `yield` / `await` are deliberately kept as keywords:
    // as bare identifiers they are legal only in sloppy non-generator /
    // non-async script code, which no preceding-token test can distinguish from
    // the keyword reading, and misreading a real `await /re/` would be the
    // worse (silent) failure.
    if (token === "of") {
      if (p < 0) return false;
      const prev = codeBefore.ch(p);
      if (prev === "]" || prev === "}") return true;
      if (/[A-Za-z0-9_$]/.test(prev)) {
        let q = p;
        while (q >= 0 && /[A-Za-z0-9_$]/.test(codeBefore.ch(q))) q--;
        const prevTok = codeBefore.slice(q + 1, p + 1);
        return !(REGEX_PERMISSIVE_KEYWORDS.has(prevTok) || prevTok === "case" || prevTok === "else" || prevTok === "do");
      }
      return false;
    }
    return true;
  }
  // ⚑ S412 — a `)` ends a value ONLY when it closes an expression. `(a + b) / 2` and
  // `f(x) / 2` are division, but `if (c) /re/.test(c)` is a regex in statement
  // position. Walk back to the matching `(` and ask what opened it — the same question
  // `tokenizer.ts`'s `closesControlFlowHead` answers on tokens, against the SAME
  // keyword set, so the two cannot disagree about which constructs count.
  //
  // ⚑ NOT CURRENTLY REACHABLE, AND RECORDED AS SUCH RATHER THAN CLAIMED AS A FIX.
  // `g-unbraced-if-for-body-regex-padded-escapes-dropped` predicted that repairing the
  // tokenizer would UNMASK the §59 mislowering here. Measured after that repair: it
  // does not — by the time `preprocessMapLiterals` runs, the `if (…)` head has been
  // stripped and the `/` is expression-initial, which the `i < 0` case above already
  // admits. This limb is defence in depth for any caller that does hand over a prefix
  // ending in a control-flow `)`, and it keeps the shared keyword set honest by giving
  // it its second consumer.
  if (lastCh === ")") {
    if (codeBefore.openOf) {
      const j = codeBefore.openOf(i);
      if (j < 0) return false; // unbalanced → the conservative answer is division
      return closeParenOpensStatement(codeBefore, j);
    }
    let depth = 0;
    for (let j = i; j >= 0; j--) {
      const c = codeBefore.ch(j);
      if (c === ")") { depth++; continue; }
      if (c !== "(") continue;
      depth--;
      if (depth !== 0) continue;
      return closeParenOpensStatement(codeBefore, j);
    }
    return false; // unbalanced → the conservative answer is division
  }
  // After `]`, digit, `.` → division.
  return false;
}

/** The `(` at `j` closes a `)` before a `/`: true when the word before it is a control-flow head. */
function closeParenOpensStatement(codeBefore: CodeBefore, j: number): boolean {
  let k = j - 1;
  while (k >= 0 && /\s/.test(codeBefore.ch(k))) k--;
  if (k < 0 || !/[A-Za-z0-9_$]/.test(codeBefore.ch(k))) return false;
  let w = k;
  while (w >= 0 && /[A-Za-z0-9_$]/.test(codeBefore.ch(w))) w--;
  return REGEX_AFTER_CLOSE_PAREN_KEYWORDS.has(codeBefore.slice(w + 1, k + 1));
}

// ---------------------------------------------------------------------------
// Object-shorthand regions (S325, g-mangler-scope-blind-shorthand-key-rename)
//
// The second region class this module knows about. The first (above) is
// LEXICAL — a string / regex / comment is opaque because of what it IS. This
// one is STRUCTURAL — `{a, b, c}` is a region because of what its identifiers
// MEAN: in an object literal they are PROPERTY NAMES as well as value
// references, and in a destructuring pattern they are property names as well as
// BINDINGS. A text pass that renames one of them renames both halves at once,
// which is never what any caller wants.
//
// Concretely, `emit-client.ts`'s whole-buffer fn-name mangle turned
//
//     const inner = wrapped || {get, post, put, del, patch}
// into
//     const inner = wrapped || {_scrml_get_2, _scrml_post_3, …}
//
// so `inner.get(...)` became `undefined` — no syntax error, no diagnostic.
// ---------------------------------------------------------------------------

/**
 * What a `{ident, ident, …}` group IS, decided from the tokens around it.
 *
 *   object-literal   an object literal in EXPRESSION position. Each member is a
 *                    shorthand property: the KEY must survive verbatim, the
 *                    VALUE is an ordinary reference and may be rewritten (which
 *                    means the caller must EXPAND `n` to `n: <rewritten>`).
 *   binding-pattern  a destructuring pattern. Both halves are off limits: the
 *                    key names the property being READ, the binding is a NEW
 *                    local. Emit verbatim.
 *   unknown          not decided. The caller SHALL leave its existing behaviour
 *                    unchanged for this region — narrowing on a guess is how a
 *                    coverage hole gets opened (pa-base §8).
 */
export type BraceGroupKind = "object-literal" | "binding-pattern" | "unknown";

export interface ObjectShorthandRegion {
  /** Index of the opening `{` within the code segment. */
  start: number;
  /** Index one past the closing `}`. */
  end: number;
  kind: BraceGroupKind;
  /** The bare identifiers between the braces, in source order. */
  names: string[];
}

/**
 * A `{` group whose ENTIRE content is a comma-separated list of bare
 * identifiers. Anything else — a `key: value` pair, a nested brace, a call, a
 * spread — fails to match, which is what keeps the cross-file module-registry
 * footer (`_scrml_modules[k] = { pub: emitted, … }`, emit-client.ts) outside
 * this region class: its members are `key: value`, not shorthand.
 */
const SHORTHAND_GROUP_RE =
  /\{\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*)*\s*,?\s*\}/g;

/**
 * Words that are never a shorthand property name, so a `{…}` containing one is
 * a BLOCK, not an object. `{ return }` / `{ break }` are the realistic emitted
 * shapes; the rest are here so the set reads as a rule rather than a patch.
 */
const NOT_A_PROPERTY_NAME = new Set([
  "return", "break", "continue", "throw", "yield", "await", "delete", "typeof",
  "void", "new", "in", "of", "instanceof", "this", "true", "false", "null",
  "if", "else", "for", "while", "do", "switch", "case", "default", "try",
  "catch", "finally", "function", "class", "const", "let", "var", "export",
  "import", "debugger", "with",
]);

/**
 * Characters that, immediately to the left of a `{`, put it in EXPRESSION
 * position — i.e. make it an object literal rather than a block.
 *
 * Deliberately minimal, in the same spirit as `REGEX_PERMISSIVE_KEYWORDS`
 * above: a false negative only leaves today's behaviour in place, while a false
 * positive would fence (or expand) something that is not an object at all.
 * `:` is NOT in the set — a `label: { … }` and a `case x: { … }` are blocks, and
 * a `key: {a, b}` property value has no measured incidence.
 * `>` is NOT in the set either, because the `>` of `=> {` opens a function BODY.
 */
const BRACE_OPENS_OBJECT_AFTER = new Set([",", "[", "=", "|", "&", "?"]);

function identifierEndingAt(code: string, i: number): { token: string; before: number } | null {
  if (i < 0 || !/[A-Za-z0-9_$]/.test(code[i])) return null;
  let j = i;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(code[j])) j--;
  return { token: code.slice(j + 1, i + 1), before: j };
}

function skipSpaceLeft(code: string, i: number): number {
  while (i >= 0 && /\s/.test(code[i])) i--;
  return i;
}

function skipSpaceRight(code: string, i: number): number {
  while (i < code.length && /\s/.test(code[i])) i++;
  return i;
}

/** Decide what a `{ident, …}` group at [open, closeExclusive) is. */
export function classifyBraceGroup(
  code: string,
  open: number,
  closeExclusive: number,
): BraceGroupKind {
  // ---- right of `}` -------------------------------------------------------
  const r = skipSpaceRight(code, closeExclusive);
  // `{a} = x` — assignment-destructuring TARGET (`==` is a comparison against
  // an object literal, `=>` is an arrow whose params were parenthesised).
  if (code[r] === "=" && code[r + 1] !== "=" && code[r + 1] !== ">") return "binding-pattern";
  // `({a}) => …` — arrow FORMAL PARAMETER.
  if (code[r] === ")") {
    const k = skipSpaceRight(code, r + 1);
    if (code[k] === "=" && code[k + 1] === ">") return "binding-pattern";
  }

  // ---- left of `{` --------------------------------------------------------
  const i = skipSpaceLeft(code, open - 1);
  if (i < 0) return "unknown";
  const ch = code[i];

  if (ch === "(") {
    // `(` is genuinely ambiguous: `f({a, b})` is a call argument (an object
    // literal) and `function f({a, b})` is a formal parameter (a pattern). Only
    // the `function`-headed form is decided; everything else reads as a call.
    const j = skipSpaceLeft(code, i - 1);
    const head = identifierEndingAt(code, j);
    if (head) {
      if (head.token === "function") return "binding-pattern";
      // `function NAME(` — step over NAME and look once more.
      const outer = identifierEndingAt(code, skipSpaceLeft(code, head.before));
      if (outer && outer.token === "function") return "binding-pattern";
    }
    return "object-literal";
  }

  if (BRACE_OPENS_OBJECT_AFTER.has(ch)) return "object-literal";

  const token = identifierEndingAt(code, i);
  if (token) {
    if (token.token === "return") return "object-literal";
    if (token.token === "const" || token.token === "let" || token.token === "var") {
      return "binding-pattern";
    }
  }

  return "unknown";
}

/**
 * Find every object-shorthand group in ONE code segment (a segment as produced
 * by `rewriteCodeSegments` — i.e. already free of strings, regex literals and
 * comments), classified by `classifyBraceGroup`.
 *
 * Returned regions are non-overlapping and in source order.
 */
export function findObjectShorthandRegions(code: string): ObjectShorthandRegion[] {
  const out: ObjectShorthandRegion[] = [];
  if (!code || code.indexOf("{") === -1) return out;
  SHORTHAND_GROUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SHORTHAND_GROUP_RE.exec(code)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const names = m[0].slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    if (names.some((n) => NOT_A_PROPERTY_NAME.has(n))) continue; // a block, not an object
    out.push({ start, end, kind: classifyBraceGroup(code, start, end), names });
  }
  return out;
}

/**
 * Split `expr` into code regions and opaque non-code regions (string / regex
 * literal / line-comment / block-comment). `transform` is applied ONLY to code
 * regions; non-code regions are emitted verbatim. Regex-vs-division is
 * disambiguated by regexAllowedAfter.
 *
 * Template literals (backtick strings) are a hybrid: their static text spans are
 * opaque string content (NEVER transformed), but their `${...}` interpolations
 * are CODE and ARE descended into and transformed. This matters for the
 * whole-buffer fn-name mangle (emit-client.ts) and the keyword-lowering passes:
 * a user fn called inside a `class="x-${fn()}"` attr template literal, or a
 * `not`/`is` operator inside any `${...}`, must be lowered the same as code in
 * raw statement position. (S144 Bug Z fenced rewrites OUT of pure `"..."`/`'...'`
 * string content; the `${...}` interior was never string content — it only
 * looked opaque because backticks shared the plain-string scanner.)
 *
 * This is the single shared fence used by every scrml keyword-lowering text
 * pass (see module header). Callers pass the substitution they want applied
 * only outside literals/comments.
 */
export function rewriteCodeSegments(
  expr: string,
  transform: (codeSegment: string) => string,
): string {
  if (!expr || typeof expr !== "string") return expr;

  const result: string[] = [];
  type Mode =
    | "code"
    | "string"
    | "template"
    | "regex"
    | "line-comment"
    | "block-comment";
  let mode: Mode = "code";
  let stringDelim = "";
  let i = 0;
  let segStart = 0;
  // S440 f18 fix round (F1/F2): the SIGNIFICANT prefix for the regex-vs-division
  // decision. `segStart` restarts after every literal/comment, so asking
  // `regexAllowedAfter` about the current segment alone made a `/` right after a
  // closed string / template / regex (or a block comment) look expression-initial
  // and open a bogus "regex" — the rest of the expression then passed through
  // UNTRANSFORMED. `ctx` carries every earlier code span verbatim, a closed
  // literal as the value token `0`, and a comment as whitespace.
  // S478 (review F4) — kept as a `CodeContext`, appended once per character: `ctxFrom` is how
  // far into `expr` the code run has been copied in, so a `/` costs O(its context), not O(text).
  // A code run is copied from `max(ctxFrom, segStart)` — after a literal, `segStart` is past it.
  const ctx = new CodeContext();
  let ctxFrom = 0;
  const ctxCode = (to: number): void => {
    const from = Math.max(ctxFrom, segStart);
    if (to > from) ctx.push(expr.slice(from, to));
    ctxFrom = Math.max(ctxFrom, to);
  };

  while (i < expr.length) {
    const ch = expr[i];

    if (mode === "code") {
      // Block comment opener
      if (ch === "/" && expr[i + 1] === "*") {
        ctxCode(i);
        result.push(transform(expr.slice(segStart, i)));
        mode = "block-comment";
        segStart = i;
        i += 2;
        continue;
      }
      // Line comment opener
      if (ch === "/" && expr[i + 1] === "/") {
        ctxCode(i);
        result.push(transform(expr.slice(segStart, i)));
        mode = "line-comment";
        segStart = i;
        i += 2;
        continue;
      }
      // Regex literal opener — only when the preceding token-context admits it
      if (ch === "/" && (ctxCode(i), regexAllowedAfterIn(ctx))) {
        result.push(transform(expr.slice(segStart, i)));
        mode = "regex";
        segStart = i;
        i++;
        continue;
      }
      // Template-literal opener — hybrid string: static spans opaque, `${...}`
      // interpolations descended into (handled in "template" mode below).
      if (ch === "`") {
        ctxCode(i);
        result.push(transform(expr.slice(segStart, i)));
        result.push("`"); // emit the opening backtick verbatim
        mode = "template";
        segStart = i + 1;
        i++;
        continue;
      }
      // String literal opener (single/double quote — fully opaque)
      if (ch === '"' || ch === "'") {
        ctxCode(i);
        result.push(transform(expr.slice(segStart, i)));
        mode = "string";
        stringDelim = ch;
        segStart = i;
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (mode === "string") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === stringDelim) {
        i++;
        result.push(expr.slice(segStart, i)); // preserve string literal as-is
        ctx.push("0"); // a closed literal is a VALUE — a following `/` divides
        segStart = i;
        mode = "code";
        continue;
      }
      i++;
      continue;
    }

    if (mode === "template") {
      // Escaped char (incl. escaped backtick / escaped `${`) — opaque, skip.
      if (ch === "\\") {
        i += 2;
        continue;
      }
      // Interpolation opener `${` — flush the static text span as opaque, then
      // descend into the interpolation interior as CODE (recursively, so nested
      // strings / regex / template literals inside the interpolation are fenced
      // correctly). Brace-depth tracking finds the matching close `}`.
      if (ch === "$" && expr[i + 1] === "{") {
        result.push(expr.slice(segStart, i)); // static template text — opaque
        const interpStart = i + 2;
        let depth = 1;
        let j = interpStart;
        let innerMode: "code" | "string" | "template" | "regex" = "code";
        let innerDelim = "";
        let innerSegStart = interpStart; // start of the current code run (for regexAllowedAfter)
        // S440 f18 fix round — same significant-prefix discipline as the outer
        // `ctx`: earlier code verbatim, a closed literal as the value `0`, a
        // comment as whitespace. Without it `${"a" / b}` opened a bogus regex
        // that swallowed the closing `}` and lost the interpolation's extent.
        // S478 (review F4) — a `CodeContext`, as the outer `ctx`.
        const innerCtx = new CodeContext();
        let innerFrom = interpStart;
        const innerCode = (to: number): void => {
          const from = Math.max(innerFrom, innerSegStart);
          if (to > from) innerCtx.push(expr.slice(from, to));
          innerFrom = Math.max(innerFrom, to);
        };
        while (j < expr.length && depth > 0) {
          const c = expr[j];
          if (innerMode === "code") {
            if (c === "\\") { j += 2; continue; }
            if (c === "{") { depth++; j++; continue; }
            if (c === "}") { depth--; j++; if (depth === 0) break; continue; }
            if (c === '"' || c === "'") {
              innerCode(j);
              innerMode = "string"; innerDelim = c; j++; continue;
            }
            if (c === "`") {
              innerCode(j);
              innerMode = "template"; j++; continue;
            }
            if (c === "/" && expr[j + 1] !== "*" && expr[j + 1] !== "/" &&
                (innerCode(j), regexAllowedAfterIn(innerCtx))) {
              innerSegStart = j; // re-read from the `/` if the regex turns out unterminated
              innerMode = "regex"; j++; continue;
            }
            // Skip line/block comments inside an interpolation (rare, but keep
            // brace counting honest — a `}` inside a comment must not close).
            if (c === "/" && expr[j + 1] === "/") {
              innerCode(j);
              innerCtx.push(" ");
              j += 2;
              while (j < expr.length && expr[j] !== "\n") j++;
              innerSegStart = j;
              continue;
            }
            if (c === "/" && expr[j + 1] === "*") {
              innerCode(j);
              innerCtx.push(" ");
              j += 2;
              while (j < expr.length && !(expr[j] === "*" && expr[j + 1] === "/")) j++;
              j += 2;
              innerSegStart = j;
              continue;
            }
            j++;
            continue;
          }
          if (innerMode === "string") {
            if (c === "\\") { j += 2; continue; }
            if (c === innerDelim) { innerMode = "code"; j++; innerCtx.push("0"); innerSegStart = j; continue; }
            j++;
            continue;
          }
          if (innerMode === "template") {
            if (c === "\\") { j += 2; continue; }
            if (c === "`") { innerMode = "code"; j++; innerCtx.push("0"); innerSegStart = j; continue; }
            // Nested template interpolation — track its braces so the outer
            // depth counter is not corrupted by `}` inside the nested string.
            if (c === "$" && expr[j + 1] === "{") {
              let nd = 1;
              j += 2;
              while (j < expr.length && nd > 0) {
                if (expr[j] === "\\") { j += 2; continue; }
                if (expr[j] === "{") nd++;
                else if (expr[j] === "}") nd--;
                j++;
              }
              continue;
            }
            j++;
            continue;
          }
          // innerMode === "regex"
          if (c === "\\") { j += 2; continue; }
          if (c === "[") {
            j++;
            while (j < expr.length) {
              if (expr[j] === "\\") { j += 2; continue; }
              if (expr[j] === "]") { j++; break; }
              j++;
            }
            continue;
          }
          if (c === "/") {
            j++;
            while (j < expr.length && /[A-Za-z0-9_$]/.test(expr[j])) j++;
            innerMode = "code";
            innerCtx.push("0"); // a closed regex is a VALUE
            innerSegStart = j;
            continue;
          }
          // Unterminated regex — back to code. `innerCtx` already holds the code
          // before the `/`; the text from the `/` onward is re-read as code.
          if (c === "\n") { innerMode = "code"; continue; }
          j++;
          continue;
        }
        // j now points just past the matching `}` (or end-of-string if
        // unterminated). The interpolation interior is [interpStart, interpEnd).
        const interpEnd = depth === 0 ? j - 1 : j;
        const interior = expr.slice(interpStart, interpEnd);
        // Recurse so nested literals/comments inside the interior are fenced.
        result.push("${");
        result.push(rewriteCodeSegments(interior, transform));
        if (depth === 0) result.push("}");
        i = j;
        segStart = i;
        continue;
      }
      // Closing backtick — flush the trailing static text, emit the backtick.
      if (ch === "`") {
        result.push(expr.slice(segStart, i)); // static template text — opaque
        result.push("`");
        ctx.push("0"); // a closed template is a VALUE
        i++;
        segStart = i;
        mode = "code";
        continue;
      }
      i++;
      continue;
    }

    if (mode === "regex") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "[") {
        // Enter char-class — consume until unescaped `]`. `/` is literal inside.
        i++;
        while (i < expr.length) {
          if (expr[i] === "\\") { i += 2; continue; }
          if (expr[i] === "]") { i++; break; }
          i++;
        }
        continue;
      }
      if (ch === "/") {
        // Closing slash — consume IdentifierPart-shaped flags
        i++;
        while (i < expr.length && /[A-Za-z0-9_$]/.test(expr[i])) i++;
        result.push(expr.slice(segStart, i)); // preserve regex literal as-is
        ctx.push("0"); // a closed regex is a VALUE
        segStart = i;
        mode = "code";
        continue;
      }
      if (ch === "\n") {
        // Unterminated regex — JS doesn't allow LF in regex bodies. Bail
        // back to code mode; what we accumulated may not parse downstream
        // but the masking layer doesn't try to be smarter than Acorn.
        mode = "code";
        continue;
      }
      i++;
      continue;
    }

    if (mode === "line-comment") {
      if (ch === "\n") {
        result.push(expr.slice(segStart, i)); // preserve comment text, newline stays in segStart slice
        ctx.push(" "); // a comment is whitespace to the regex-vs-division decision
        segStart = i;
        mode = "code";
        continue;
      }
      i++;
      continue;
    }

    if (mode === "block-comment") {
      if (ch === "*" && expr[i + 1] === "/") {
        i += 2;
        result.push(expr.slice(segStart, i)); // preserve comment text
        ctx.push(" "); // a comment is whitespace to the regex-vs-division decision
        segStart = i;
        mode = "code";
        continue;
      }
      i++;
      continue;
    }
  }

  // Final segment
  if (mode === "code") {
    result.push(transform(expr.slice(segStart)));
  } else {
    // Unterminated string/regex/comment — preserve as-is. Downstream
    // parsing will surface the syntax error.
    result.push(expr.slice(segStart));
  }

  return result.join("");
}

// ---------------------------------------------------------------------------
// Code-only view + `replaceInCode` (S478, g-impl1-bootstrap-build-rewrites-string-literals-s473)
//
// The SAME lexical fence as `rewriteCodeSegments`, offered in a second shape for passes that
// cannot work one code segment at a time. `rewriteCodeSegments` hands the transform each code
// run on its own, so a pattern whose match legitimately SPANS a literal (`T.toEnum("x")`, the
// `[\s\S]*` of an inline `match`, a paren-balanced argument list holding a string) cannot be
// expressed with it. Here the pattern is run over a SAME-LENGTH view of the whole text in which
// every literal / comment character is replaced by NON_CODE, and the match is spliced into the
// ORIGINAL text: capture groups are read from the original by their indices, so a literal a
// match spans comes through byte for byte. Matches that begin outside code are skipped, so no
// pattern can act on the content of a string, a template literal's static text, a regex body or
// a comment, while a template's `${ … }` interpolations stay code (they are rewritten).
// ---------------------------------------------------------------------------

/** What a non-code character becomes in `codeOnlyView`. Matches no identifier, space, quote or bracket class. */
export const NON_CODE = "\u0000";

/** True when `expr` has no character that can open a literal or comment — it is all code. */
function allCode(expr: string): boolean {
  return !/["'`/]/.test(expr);
}

/**
 * `expr` with every character that is NOT code (string / template-static / regex / comment
 * text, delimiters included; a template's `${` `}` are delimiters, its interpolation interior
 * is code) replaced by `NON_CODE`. Same length as `expr`. The fence is `rewriteCodeSegments`;
 * code-ness is read with two distinct marks, so a literal that happens to hold a mark
 * character can never pass for code.
 */
export function codeOnlyView(expr: string): string {
  if (!expr || allCode(expr)) return expr;
  const A = "\u0001";
  const B = "\u0002";
  const a = rewriteCodeSegments(expr, (seg) => A.repeat(seg.length));
  const b = rewriteCodeSegments(expr, (seg) => B.repeat(seg.length));
  // The fence never changes the length (non-code is copied, code is replaced 1:1); if it ever
  // did, the safe answer is "nothing is code" — a pass then rewrites nothing.
  if (a.length !== expr.length || b.length !== expr.length) return NON_CODE.repeat(expr.length);
  // Copied run by run (S478 review F4): a code run is one slice, a non-code run one repeat.
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const code = a[i] === A && b[i] === B;
    let j = i + 1;
    while (j < expr.length && (a[j] === A && b[j] === B) === code) j++;
    out.push(code ? expr.slice(i, j) : NON_CODE.repeat(j - i));
    i = j;
  }
  return out.join("");
}

type InCodeReplacer = (match: string, ...rest: any[]) => string;

/** Expand `$&` / `$1`…`$99` / `$$` in a replacement string, from ORIGINAL-text groups. */
function expandReplacement(rep: string, whole: string, groups: Array<string | undefined>): string {
  return rep.replace(/\$(\$|&|\d{1,2})/g, (tok, g: string) => {
    if (g === "$") return "$";
    if (g === "&") return whole;
    const n = Number(g);
    return n >= 1 && n <= groups.length ? groups[n - 1] ?? "" : tok;
  });
}

/**
 * `expr.replace(re, replacement)`, acting ONLY where the match begins in code (see the section
 * header). The pattern is matched against `codeOnlyView(expr)`; the match text, the capture
 * groups and the offset handed to a replacer function are the ORIGINAL text's, as
 * `String.prototype.replace` hands them (`(match, g1, …, gN, offset, whole)`). `re` is always
 * applied globally. Text with nothing that can open a literal is a plain `replace`.
 */
export function replaceInCode(expr: string, re: RegExp, replacement: string | InCodeReplacer): string {
  if (!expr || typeof expr !== "string") return expr;
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  if (allCode(expr)) return expr.replace(new RegExp(re.source, flags), replacement as any);
  const view = codeOnlyView(expr);
  const rx = new RegExp(re.source, flags.includes("d") ? flags : flags + "d");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(view)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[0].length === 0 || view[start] === NON_CODE) { rx.lastIndex = start + 1; continue; }
    const whole = expr.slice(start, end);
    const groups = (m.indices ?? []).slice(1).map((ix) => (ix ? expr.slice(ix[0], ix[1]) : undefined));
    const rep = typeof replacement === "function"
      ? replacement(whole, ...groups, start, expr)
      : expandReplacement(replacement, whole, groups);
    out += expr.slice(last, start) + rep;
    last = end;
  }
  return last === 0 ? expr : out + expr.slice(last);
}

/**
 * Every match of `re` that begins in code, with its ORIGINAL text and groups — the read-only
 * twin of `replaceInCode`, for scans that only report.
 */
export function matchAllInCode(
  expr: string,
  re: RegExp,
): Array<{ index: number; text: string; groups: Array<string | undefined> }> {
  const hits: Array<{ index: number; text: string; groups: Array<string | undefined> }> = [];
  if (!expr || typeof expr !== "string") return hits;
  replaceInCode(expr, re, (whole: string, ...rest: any[]) => {
    hits.push({ index: rest[rest.length - 2] as number, text: whole, groups: rest.slice(0, -2) });
    return whole;
  });
  return hits;
}
