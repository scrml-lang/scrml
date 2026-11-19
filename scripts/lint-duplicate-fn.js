#!/usr/bin/env bun
// lint-duplicate-fn — fail if a bootstrap source file declares two top-level functions with one
// name, or declares a function whose name it also imports (or imports one name twice).
//
// WHY (g-impl1-bootstrap-duplicate-fn-last-wins-s473). impl#1 builds the bootstrap
// (`compiler/self-host-v2/*.scrml`) with NO error for either collision, and resolves it silently:
//   - two `fn foo` in one file: both are emitted (`_scrml_foo_N`, `_scrml_foo_M`) and EVERY call,
//     and the file's export entry, binds to the LAST one. A new helper whose name is already taken
//     replaces the old one for all of the old one's callers.
//   - `import { foo }` plus a local `fn foo`: the import is emitted as `const { foo } = …` and every
//     call binds to the IMPORT; the local function is dead.
// Both were measured on impl#1's emitted chunks (S473). impl#1 is frozen for semantics (S471
// policy), so this lint is the check.
//
// S479 (s479-import-shadow) — WIDENED TOWARD THE §7.6 FILE-SCOPE NAMESPACE, and RUN BY THE BUILD.
//   - The namespace is SPEC §7.6's: "A `let` / `const`, a `function`, a `type` and a user declaration
//     (`<card>`) bound at file scope share one namespace … SHALL be a compile error (E-SCOPE-010:
//     duplicate binding in file scope)", "A program cell (`<count:int=0/>`) is a file-scope binding
//     too", and "a file that imports a name and also declares it is E-SCOPE-010".
//   - COVERED (any pair of these, in one file): a file-scope `fn` / `function`; `const` / `let` / `lin`
//     (a destructuring `const { a, b: c } = o` / `const [a, b] = t` binds each name); `type`; a program
//     cell (`<count:int=0/>`, `let <x…/>`, `const <x> = …`) at the file top or at depth 0 of a
//     `<program>` / `<page>` / `<db>` body; `import { a, b as c }` and `import * as ns`.
//     (impl#1 on `import { K }` + `const K`: the local wins and the import is dropped.)
//   - NOT COVERED (the bootstrap compiler reports these on a user program; this build-time lint does
//     not): a user declaration (`<card>` — a component definition) beside a function / import of its
//     name; a cell written inside a `${}` block (`${ <x=1/> }`, `${ const <x> = … }` — §6.9.1: "State
//     declarations inside a logic context `${ }` do NOT hoist beyond the `${ }` block"); bindings in a
//     `${}` interpolation nested inside a markup element, or in a `<channel>` body (its own structural
//     scope, §6.9.1); an `export { … }` list; the bootstrap's cross-file rule ("Across files, only
//     EXPORTED names can collide") beyond imports. None of these shapes occurs in the bootstrap's own
//     sources today; a miss here is a missed refusal, never a false refusal.
//   - The hook and CI ran this, but the bootstrap BUILD did not: a lane that built and measured
//     locally got a silently miscompiled bundle (lex.scrml exporting `opensTag` into parse.scrml,
//     which had its own `opensTag`: bootstrap conformance 648 → 515, nothing reported). The build
//     (compiler/self-host-v2/slice-m1/harness.js `buildBundleChunks`) now calls `lintFiles` on the
//     bundle's inputs and refuses to build.
//
// HOW THE BUILD LINKS THE FILES (why the check is per file). impl#1 compiles each bootstrap file to
// its own chunk with its own scope; a chunk sees another file's names ONLY through an `import`,
// which is emitted as `const { a, b } = _scrml_modules["<file>"]`. Function names are file-local
// (`_scrml_<name>_<n>`). So the one namespace a name can collide in is ONE FILE's top level: its
// own functions plus the names it imports. Two files may each declare `foo`; that is not a
// collision unless one file imports the other's `foo` (or two files' `foo`) — checked here.
//
// WHAT IS LINTED. The bootstrap's own sources: every `.scrml` directly in the root
// (default `compiler/self-host-v2`), every `.scrml` directly in a `slice-*` directory (the compile
// entries the slices build — `bundle.scrml`, `css-bundle.scrml` — and the hand-built Core modules
// they link, `*.core.scrml`), and every file those import, transitively (relative imports only).
// Test INPUT programs (acceptance cases, slice `src/` / `fixtures/` / `bench/` programs) are not
// bootstrap source and are not linted — a negative case may declare a duplicate on purpose.
//
// WHAT COUNTS AS TOP LEVEL. A declaration at bracket depth 0 of a file-scope logic region (see
// "WHICH TEXT IS FILE-SCOPE LOGIC" below) — not inside a function body, an arrow or object literal,
// a block, a `for (…)` head or a call. Markup text is never read as code. (`export`, `pure`,
// `server` … prefixes don't matter: the name is the next token.)
//
// WHY A JS SCRIPT ON TOKENS — the same reasons as scripts/lint-no-default-arm.js: it must run over
// the bootstrap source before the bootstrap can parse itself, it must not read impl#1's AST, and it
// needs only tokens (`compiler/native-parser/lex.js`), which also makes it immune to `fn` inside
// strings and comments.
//
// USAGE:  bun (or node) scripts/lint-duplicate-fn.js [--root <dir>] [--json]
//         exit 0 = clean, 1 = violations, 2 = usage error.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lex } from "../compiler/native-parser/lex.js";

const OPEN = new Set(["LParen", "LBracket", "LBrace", "TemplateInterpStart"]);
const CLOSE = new Set(["RParen", "RBracket", "RBrace", "TemplateInterpEnd"]);

function matchClose(toks, i) {
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    if (OPEN.has(toks[j].kind)) depth++;
    else if (CLOSE.has(toks[j].kind)) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

const isFnKw = (t) => t && (t.kind === "KwFn" || t.kind === "KwFunction");
// s479-import-shadow: the other file-scope binders of §7.6 ("A `let` / `const`, a `function`, a `type`
// and a user declaration … bound at file scope share one namespace"). r1: `lin` too — a `lin` is a
// variable declaration bound where it is written, like `let`.
const BINDER = { KwConst: "const", KwLet: "let", KwLin: "lin", KwType: "type" };

// ---------------------------------------------------------------------------------------------
// r1 (s479-import-shadow, review F1/F2) — WHICH TEXT IS FILE-SCOPE LOGIC. A scrml file is markup with
// logic regions in it; the native lexer reads code only. So the file is first split into the regions
// whose top-level statements bind at file scope, and only their tokens are scanned:
//   - a `${ … }` block at the FILE top or directly in a `<program>` / `<page>` / `<db>` body (§7.6:
//     "A variable declared with `let` or `const` at the top level of a file-level `${}` block SHALL be
//     in scope for all subsequent `${}` blocks");
//   - the bare statements of a `<program>` / `<page>` / `<db>` body, which are code-default (§4.18.1
//     S441: "a bare run is parsed as logic at its position — declarations auto-lift as before (§40.8)";
//     S472 for `<db>`). A markup element inside such a body "opens its own free-text body" (§4.18.1),
//     so it is skipped;
//   - program cells — `<count:int=0/>`, `let <x…/>`, `const <x> = …` — written at the file top or at
//     depth 0 of such a body (§7.6: "A program cell (`<count:int=0/>`) is a file-scope binding too").
// Markup text (`<p>let me know</p>`), comments (`//` per §4.7, `<!-- -->`), a `${}` interpolation
// inside a markup element, `#{}` / `?{}` / `^{}` blocks and `<script>` / `<style>` bodies are skipped.
// Within a region only DEPTH-0 declarations count (§7.6: "Variables declared inside a function body
// within a `${}` block are scoped to that function. Only top-level declarations within the `${}` block
// participate in file scope"; §7.3.3 block scoping) — so a `const` in an anonymous `fn(x) { }` value, an
// arrow body, an object method, an `if` / `while` block or a `for (let i …)` head is not file scope.
// ---------------------------------------------------------------------------------------------

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
// code-default bodies whose bare statements are file scope (§4.18.1 S441 / S472, §40.8)
const CODE_BODY_ELEMENTS = new Set(["program", "page", "db"]);
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_.\-]/;
// a token after which `<name` is a comparison, not markup
const VALUE_END = new Set(["Ident", "NumberLit", "StringLit", "RegexLit", "BoolLit", "TemplateChunk", "RParen", "RBracket", "KwTrue", "KwFalse", "KwNull", "KwUndefined", "KwThis"]);
const CELL_BINDERS = new Set(["KwConst", "KwLet", "KwLin"]);

/**
 * The file-scope logic of one source text: `{ toks, cells, at }`. `toks` are lexer tokens with ABSOLUTE
 * offsets (`start`, `end`), in source order, plus two markers: `Region` (a new region starts: depth 0)
 * and `Sep` (skipped text in between — two tokens either side of it are not adjacent). `cells` are the
 * program cells found at file scope. `at(offset)` is `{ line, col }` (1-based).
 */
export function logicTokens(src) {
  const n = src.length;
  const toks = [];
  const cells = [];
  const lineStarts = [0];
  for (let k = 0; k < n; k++) if (src.charCodeAt(k) === 10) lineStarts.push(k + 1);
  const at = (off) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: off - lineStarts[lo] + 1 };
  };
  const lexFrom = (off) => lex(src.slice(off)).map((t) => ({ kind: t.kind, text: t.text, start: off + t.span.start, end: off + t.span.end }));
  const mark = (kind, off) => toks.push({ kind, text: "", start: off, end: off });

  // a quoted run starting at p (the quote); returns the offset after its closing quote
  const skipQuoted = (p) => {
    const q = src[p];
    let k = p + 1;
    while (k < n && src[k] !== q) k += src[k] === "\\" ? 2 : 1;
    return Math.min(n, k + 1);
  };
  // a bracketed run starting at p (`{`, `(` or `[`), quotes skipped; returns the offset after its close
  const skipBalanced = (p) => {
    let depth = 0;
    let k = p;
    while (k < n) {
      const c = src[k];
      if (c === "\"" || c === "'" || c === "`") { k = skipQuoted(k); continue; }
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) return k + 1; }
      k++;
    }
    return n;
  };
  const lineEnd = (p) => { const e = src.indexOf("\n", p); return e < 0 ? n : e; };
  // only spaces / tabs before p on its line
  const lineStartAt = (p) => /^[ \t]*$/.test(src.slice(src.lastIndexOf("\n", p - 1) + 1, p));
  // `<!-- … -->` at p; returns the offset after it
  const skipHtmlComment = (p) => { const e = src.indexOf("-->", p + 4); return e < 0 ? n : e + 3; };

  // the tag head `<name …>` / `<name … />` at p
  const readHead = (p) => {
    let q = p + 1;
    while (q < n && NAME_CHAR.test(src[q])) q++;
    const name = src.slice(p + 1, q);
    const isCell = src[q] === ":" || src[q] === "=";
    let selfClose = false;
    while (q < n) {
      const c = src[q];
      if (c === "\"" || c === "'" || c === "`") { q = skipQuoted(q); continue; }
      if (c === "{" || c === "(" || c === "[") { q = skipBalanced(q); continue; }
      if (c === "/" && src[q + 1] === ">") { selfClose = true; q += 2; break; }
      if (c === ">") { q++; break; }
      q++;
    }
    return { name, isCell, selfClose, end: Math.min(q, n) };
  };
  const addCell = (p, name) => { if (name) cells.push({ name, ...at(p + 1), kind: "cell" }); };

  // a `${ … }` logic region whose body starts at p (after the `{`); returns the offset after its `}`
  const logicRegion = (p) => {
    mark("Region", p);
    let depth = 0;
    for (const t of lexFrom(p)) {
      if (t.kind === "EOF") return n;
      if (t.kind === "LBrace") depth++;
      else if (t.kind === "RBrace") { if (depth === 0) return t.end; depth--; }
      toks.push(t);
    }
    return n;
  };

  // an element at p (`<` + a name start). `fileScope`: a cell here binds at file scope.
  const scanElement = (p, fileScope) => {
    const head = readHead(p);
    if (head.isCell) { if (fileScope) addCell(p, head.name); return head.end; }
    const lower = head.name.toLowerCase();
    if (head.selfClose || VOID_ELEMENTS.has(lower) || head.end >= n) return head.end;
    let r;
    if (RAW_TEXT_ELEMENTS.has(lower)) {
      const e = src.toLowerCase().indexOf("</" + lower, head.end);
      r = e < 0 ? n : e;
    } else if (CODE_BODY_ELEMENTS.has(head.name)) r = scanCodeBody(head.end);
    else r = scanMarkup(head.end, false);
    if (r >= n) return n;
    // r is at a closer `</…`: this element's (`</name>` / `</>`) is consumed; another's is left to it
    const m = /<\/\s*([A-Za-z0-9_.\-]*)\s*>/y;
    m.lastIndex = r;
    const hit = m.exec(src);
    if (!hit) return r + 2;
    return hit[1] === "" || hit[1] === head.name ? r + hit[0].length : r;
  };

  // markup (the file top when `top`, else an element's free-text body) from p; returns the offset of the
  // closer that ends the body (`</`), or n
  const scanMarkup = (p, top) => {
    while (p < n) {
      const c = src[p];
      if (c === "/" && src[p + 1] === "/" && (p === 0 || /\s/.test(src[p - 1]))) { p = lineEnd(p); continue; }
      if (c === "<" && src.startsWith("<!--", p)) { p = skipHtmlComment(p); continue; }
      if (c === "$" && src[p + 1] === "{") { p = top ? logicRegion(p + 2) : skipBalanced(p + 1); continue; }
      if ((c === "#" || c === "?" || c === "^") && src[p + 1] === "{") { p = skipBalanced(p + 1); continue; }
      if (c === "<" && src[p + 1] === "/") {
        if (!top) return p;
        const m = /<\/[^>]*>?/y; // a stray closer at the file top: skip it
        m.lastIndex = p;
        p += m.exec(src)[0].length;
        continue;
      }
      if (c === "<" && NAME_START.test(src[p + 1] ?? "")) { p = scanElement(p, top); continue; }
      // `const <x> = …` / `let <x…/>` / `lin <x…/>` starting a line at the file top: a cell declaration
      if (top && (c === "c" || c === "l") && lineStartAt(p)) {
        const m = /(?:const|let|lin)[ \t]+(?=<[A-Za-z_])/y;
        m.lastIndex = p;
        const hit = m.exec(src);
        if (hit) {
          const lt = p + hit[0].length;
          const head = readHead(lt);
          addCell(lt, head.name);
          p = head.end;
          continue;
        }
      }
      p++;
    }
    return n;
  };

  // a code-default body (`<program>` / `<page>` / `<db>`) from p; returns the offset of its closer (`</`), or n
  const scanCodeBody = (p) => {
    mark("Region", p);
    let lexed = lexFrom(p);
    let i = 0;
    let prev = null;
    let depth = 0;
    const regionBrace = []; // per open `{`: is it a `${`'s brace (not emitted)?
    const resume = (off) => { mark("Sep", off); lexed = lexFrom(off); i = 0; prev = null; };
    while (i < lexed.length) {
      const t = lexed[i];
      if (t.kind === "EOF") return n;
      if (t.kind === "LessThan") {
        const nx = src[t.end] ?? "";
        if (nx === "/") return t.start;
        if (src.startsWith("<!--", t.start)) { resume(skipHtmlComment(t.start)); continue; }
        // markup when `<` cannot be a comparison: no value before it, or it starts its line (a line
        // starting with an operator is E-STMT-LEADING-OPERATOR, §7.2.2, so a line-start `<` is a tag)
        if (NAME_START.test(nx) && (prev === null || !VALUE_END.has(prev.kind) || lineStartAt(t.start))) {
          let end;
          if (prev !== null && CELL_BINDERS.has(prev.kind)) {
            // `let <x…/>` / `const <x> = …`: a cell declaration; the `= …` after it is code
            const head = readHead(t.start);
            if (depth === 0) addCell(t.start, head.name);
            end = head.end;
          } else end = scanElement(t.start, depth === 0);
          resume(end);
          continue;
        }
      }
      if (t.kind === "Ident" && t.text === "$" && lexed[i + 1] && lexed[i + 1].kind === "LBrace" && lexed[i + 1].start === t.end) {
        regionBrace.push(true);
        i += 2;
        continue;
      }
      if (t.kind === "LBrace") regionBrace.push(false);
      if (t.kind === "RBrace" && regionBrace.pop() === true) { i++; continue; }
      if (OPEN.has(t.kind)) depth++;
      else if (CLOSE.has(t.kind)) depth = Math.max(0, depth - 1);
      toks.push(t);
      prev = t;
      i++;
    }
    return n;
  };

  scanMarkup(0, true);
  return { toks, cells, at };
}

// the names a destructuring pattern at toks[j] binds (`{ a, b: c, …d }`, `[a, , b = 1]`), pushed to
// `out`; returns the index after the pattern
function patternNames(toks, j, out, limit) {
  const t = toks[j];
  if (!t || j >= limit) return j + 1;
  if (t.kind === "Ident") { out.push(t); return j + 1; }
  if (t.kind !== "LBrace" && t.kind !== "LBracket") return j + 1;
  const close = matchClose(toks, j);
  const end = close === -1 ? limit : Math.min(close, limit);
  const obj = t.kind === "LBrace";
  let k = j + 1;
  while (k < end) {
    const before = k;
    const u = toks[k];
    if (u.kind === "Comma") { k++; continue; }
    if (u.kind === "Ellipsis") k = patternNames(toks, k + 1, out, end);
    else if (obj && toks[k + 1] && toks[k + 1].kind === "Colon") k = patternNames(toks, k + 2, out, end);
    else if (obj && u.kind === "LBracket") {
      const c = matchClose(toks, k);
      k = c === -1 ? end : c + 1;
      if (toks[k] && toks[k].kind === "Colon") k = patternNames(toks, k + 1, out, end);
    } else k = patternNames(toks, k, out, end);
    // a default `= expr`: skip to the next `,` at this level
    if (toks[k] && toks[k].kind === "Assign") {
      k++;
      let d = 0;
      while (k < end && !(d === 0 && toks[k].kind === "Comma")) {
        if (OPEN.has(toks[k].kind)) d++;
        else if (CLOSE.has(toks[k].kind)) d--;
        k++;
      }
    }
    if (k <= before) k = before + 1;
  }
  return end + 1;
}

/**
 * The file-scope names of one source text (see "WHICH TEXT IS FILE-SCOPE LOGIC" above):
 *   fns:     [{ name, line, col }]           every file-scope `fn` / `function`
 *   binds:   [{ name, line, col, kind }]     every file-scope `const` / `let` / `lin` / `type` binding
 *                                            (destructured names included) and program cell (kind "cell")
 *   imports: [{ name, line, col, from }]     every name an `import { … } from "…"` (or `import * as x`) binds
 */
export function topLevelNames(src) {
  const { toks, cells, at } = logicTokens(src);
  const fns = [];
  const binds = [...cells];
  const imports = [];
  const pos = (t) => at(t.start);
  const unquote = (s) => s.replace(/^["'`]|["'`]$/g, "");
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === "Region") { depth = 0; continue; }
    if (t.kind === "Sep") continue;
    if (OPEN.has(t.kind)) { depth++; continue; }
    if (CLOSE.has(t.kind)) { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    // `import * as ns from "…"` binds `ns`
    if (t.kind === "KwImport" && toks[i + 1] && toks[i + 1].text === "*" && toks[i + 2] && toks[i + 2].kind === "KwAs" && toks[i + 3] && toks[i + 3].kind === "Ident") {
      const ns = toks[i + 3];
      const from = toks[i + 4] && toks[i + 4].kind === "KwFrom" && toks[i + 5] ? toks[i + 5].text : "";
      imports.push({ name: ns.text, ...pos(ns), from: unquote(from) });
      i += 3;
      continue;
    }
    if (t.kind === "KwImport" && toks[i + 1] && toks[i + 1].kind === "LBrace") {
      const close = matchClose(toks, i + 1);
      if (close === -1) continue;
      const from = toks[close + 1] && toks[close + 1].kind === "KwFrom" && toks[close + 2] ? toks[close + 2].text : "";
      // `{ a, b as c, … }`: the bound name is the one after `as`, else the name itself
      let j = i + 2;
      while (j < close) {
        if (toks[j].kind === "Comma") { j++; continue; }
        let bound = toks[j];
        if (toks[j + 1] && toks[j + 1].kind === "KwAs" && toks[j + 2]) { bound = toks[j + 2]; j += 3; } else j += 1;
        if (bound.kind === "Ident") imports.push({ name: bound.text, ...pos(bound), from: unquote(from) });
      }
      i = close;
      continue;
    }
    // the native lexer reads `type` as an identifier: a file-scope `type Name` is a declaration
    // (a struct field `type: string` is followed by `:`, not by a name)
    const kind = BINDER[t.kind] ?? (t.kind === "Ident" && t.text === "type" ? "type" : undefined);
    if (kind) {
      const next = toks[i + 1];
      if (next && next.kind === "Ident") binds.push({ name: next.text, ...pos(next), kind });
      else if (next && kind !== "type" && (next.kind === "LBrace" || next.kind === "LBracket")) {
        // a destructuring `const { a, b: c } = o` binds each name at file scope
        const names = [];
        const after = patternNames(toks, i + 1, names, toks.length);
        for (const nm of names) binds.push({ name: nm.text, ...pos(nm), kind });
        i = Math.max(i, after - 1);
      }
      continue;
    }
    if (!isFnKw(t)) continue;
    const name = toks[i + 1] && toks[i + 1].kind === "Star" ? toks[i + 2] : toks[i + 1];
    if (!name || name.kind !== "Ident") continue; // an anonymous `fn(x) { … }` value binds nothing
    fns.push({ name: name.text, ...pos(name) });
    // its parameters and body are nested (depth > 0), so their names are not file scope
  }
  return { fns, binds, imports };
}

const what = (d) => (d.kind === "cell" ? `cell \`<${d.name}>\`` : d.kind ? `\`${d.kind} ${d.name}\`` : `function \`${d.name}\``);

/**
 * Lint one source text. Returns { violations: [{ line, col, message }] }.
 * One file-scope namespace (SPEC §7.6, E-SCOPE-010 "duplicate binding in file scope"): the file's
 * top-level functions, `const` / `let` / `type` declarations and imported names. A second binding of
 * a name is reported at the second one (an import, at the local declaration it collides with).
 */
export function lintText(src) {
  const { fns, binds, imports } = topLevelNames(src);
  const violations = [];
  const firstDecl = new Map();
  const firstImport = new Map();
  for (const im of imports) {
    const prev = firstImport.get(im.name);
    if (prev) violations.push({ line: im.line, col: im.col, message: `E-SCOPE-010: \`${im.name}\` is imported twice (line ${prev.line}, from "${prev.from}"; here from "${im.from}") — impl#1 binds every use to one of them silently` });
    else firstImport.set(im.name, im);
  }
  const decls = [...fns, ...binds].sort((a, b) => a.line - b.line || a.col - b.col);
  for (const d of decls) {
    const prev = firstDecl.get(d.name);
    if (prev) {
      const both = !d.kind && !prev.kind;
      violations.push({ line: d.line, col: d.col, message: both
        ? `E-SCOPE-010: duplicate top-level function \`${d.name}\` (first at line ${prev.line}) — impl#1 binds EVERY call to the last one; rename one`
        : `E-SCOPE-010: ${what(d)} is a second file-scope binding of \`${d.name}\` (first: ${what(prev)} at line ${prev.line}) — impl#1 resolves the pair silently; rename one` });
      continue;
    }
    firstDecl.set(d.name, d);
    const im = firstImport.get(d.name);
    if (!im) continue;
    violations.push({ line: d.line, col: d.col, message: d.kind
      ? `E-SCOPE-010: top-level ${what(d)} has the name of an import (line ${im.line}, from "${im.from}") — impl#1 silently drops one of the two; rename one`
      : `E-SCOPE-010: top-level function \`${d.name}\` has the name of an import (line ${im.line}, from "${im.from}") — impl#1 binds every call to the import and this function is dead; rename one` });
  }
  return { violations };
}

const RELATIVE_IMPORT = /^\.\.?\//;

/** The bootstrap source files under `root`: top-level `.scrml`, the `.scrml` directly in each `slice-*` dir, and their relative imports. */
export function bootstrapFiles(root) {
  const seeds = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (name.endsWith(".scrml") && statSync(p).isFile()) seeds.push(p);
    else if (name.startsWith("slice-") && statSync(p).isDirectory()) {
      for (const inner of readdirSync(p)) if (inner.endsWith(".scrml") && statSync(join(p, inner)).isFile()) seeds.push(join(p, inner));
    }
  }
  return importClosure(seeds);
}

/** `seeds` plus every file they import, transitively (relative imports only), sorted. */
export function importClosure(seeds) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const f = queue.shift();
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    for (const im of topLevelNames(readFileSync(f, "utf8")).imports) {
      if (RELATIVE_IMPORT.test(im.from)) queue.push(resolve(dirname(f), im.from));
    }
  }
  return [...seen].sort();
}

/**
 * Lint `seeds` and everything they import (relative imports, transitively).
 * Returns { files, violations: [{ file, line, col, message }] }. s479-import-shadow: the bootstrap's
 * BUILD (compiler/self-host-v2/slice-m1/harness.js `buildBundleChunks`) calls this on the bundle's
 * inputs, so a collision is refused before impl#1 builds a silently miscompiled bundle.
 */
export function lintFiles(seeds) {
  const files = importClosure(seeds);
  const violations = [];
  for (const f of files) {
    for (const v of lintText(readFileSync(f, "utf8")).violations) violations.push({ file: f, ...v });
  }
  return { files, violations };
}

/** Lint the bootstrap sources under `root`. Returns { files, violations: [{ file, line, col, message }] }. */
export function lintTree(root) {
  return lintFiles(bootstrapFiles(root));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  // `import.meta.dir` is bun-only; derive the script dir from the URL so `node` runs it too
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "compiler", "self-host-v2");
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root") root = resolve(args[++i] ?? "");
    else if (args[i] === "--json") json = true;
    else { console.error(`unknown argument: ${args[i]}`); process.exit(2); }
  }
  const r = lintTree(root);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    for (const v of r.violations) console.log(`${relative(process.cwd(), v.file)}:${v.line}:${v.col}: ${v.message}`);
    console.log(`lint-duplicate-fn: ${r.files.length} file(s), ${r.violations.length} violation(s)`);
  }
  process.exit(r.violations.length > 0 ? 1 : 0);
}
