/**
 * s34-provenance.ts — the §34.0 provenance RESOLVER, as pure functions (so it can be tested
 * without running the census, which reads SPEC.md and walks the tree at import time).
 *
 * Used by scripts/s34-census.ts `--check-new` (CI: new/changed rows) and `--check-all` (every
 * §34 row — the measurement mode).
 *
 * WHAT IT ANSWERS. A §34 row's provenance note must RESOLVE (S364 trap T8): every backticked repo
 * path must exist, and every symbol the row names must exist in executable source.
 *
 * WHY THIS FILE EXISTS (S474, g-s34-census-symbol-check-ignores-scrml-s474). The resolver it
 * replaces was hollow for the bootstrap in two ways at once:
 *   1. identifiers were collected from `.ts`/`.js`/`.mjs` only, though the census walks
 *      `compiler/self-host-v2` — so a CORRECT row naming a bootstrap function
 *      (`compiler/self-host-v2/analyze.scrml` `resolveSlot`) failed as STALE PROVENANCE;
 *   2. the workaround form `` `…analyze.scrml` (`resolveSlot`) `` passed only because the
 *      resolver did not parse the parenthesized form at all — so NO bootstrap symbol cited in any
 *      §34 row was checked, and a renamed bootstrap function passed silently.
 * Both citation forms now resolve, and a symbol cited WITH a path is looked up in THAT file (or,
 * for a directory path, the source files under it) — not anywhere in the tree.
 *
 * WHAT COUNTS AS AN IDENTIFIER. Only executable source: comments are blanked, and string /
 * display-text literal CONTENTS are blanked, so a name that survives only in a comment, an error
 * message or a display string does not launder a claim about a deleted function. (Before S474 the
 * JS side blanked comments but copied string contents verbatim — a symbol named only in a message
 * string resolved.)
 *
 * KNOWN LENIENCIES (stated, not hidden; each only ever ADMITS a name, never rejects a correct row):
 *   - scrml: a word of FREE markup text (display text that is not a `"…"` literal) counts — see
 *     stripScrmlForIdents for why the file is not split into markup and logic.
 *   - JS/TS: template-literal text counts — it is emitted code in this codebase (see
 *     stripJsForIdents), so a name surviving only in a template-literal MESSAGE still resolves.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/g;
export const SOURCE_EXT = /\.(ts|js|mjs|scrml)$/;
const JS_EXT = /\.(ts|js|mjs)$/;

/** Keep the character's line structure (newline stays, anything else becomes a space). */
const blank = (c: string) => (c === "\n" ? "\n" : " ");

const REGEX_PREV_KEYWORD = /(?:^|[^A-Za-z0-9_$])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await|instanceof)$/;
/**
 * At a `/` (not `//`, not `/*`) in code: is it a REGEX LITERAL opener? The usual heuristic — a regex
 * follows an operator, an opening bracket, a separator, a keyword or the start of input; a
 * division follows an operand (identifier, number, `)`, `]`). `}` is read as division (a regex
 * after a block is rare, and misreading one only fails to blank it).
 * WHY: a regex literal holding a quote or backtick (protect-egress.ts `foldIdent`'s
 * /…"…`…/) otherwise opens a string and blanks the code after it — measured, it hid
 * `findAuthoredResponseConstruction` and failed E-PROTECT-005's correct row.
 */
function regexStartsAt(out: string): boolean {
  let j = out.length - 1;
  while (j >= 0 && (out[j] === " " || out[j] === "\t" || out[j] === "\n" || out[j] === "\r")) j--;
  if (j < 0) return true;
  const p = out[j];
  if (/[A-Za-z0-9_$]/.test(p)) return REGEX_PREV_KEYWORD.test(out.slice(Math.max(0, j - 11), j + 1));
  return !/[)\]}]/.test(p);
}
/** The end index (exclusive) of the regex literal starting at `i` (a `/`), or -1 if it does not
 *  close on its line (then it was a division after all). */
function regexEnd(src: string, i: number): number {
  let k = i + 1, cls = false;
  while (k < src.length) {
    const c = src[k];
    if (c === "\n") return -1;
    if (c === "\\") { k += 2; continue; }
    if (cls) { if (c === "]") cls = false; }
    else if (c === "[") cls = true;
    else if (c === "/") { k++; while (k < src.length && /[a-z]/i.test(src[k])) k++; return k; }
    k++;
  }
  return -1;
}
/** A regex literal's text, blanked (its body is a pattern, not identifiers). */
const blankRegex = (src: string, i: number, end: number) => "/" + " ".repeat(Math.max(0, end - i - 1));

/**
 * JS/TS: blank `//` and `/* *\/` comments, the contents of `'…'` / `"…"` literals, and regex
 * literal bodies. Template literals are KEPT (see the note in the loop: they are emitted code
 * here) — so a name surviving only in a template-literal message still resolves; that residual is
 * the price of not failing every row that cites an emitted runtime helper. Offsets and line count
 * are preserved.
 */
export function stripJsForIdents(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  // Stack of template-literal interpolation brace depths: when non-empty we are in code that a
  // `}` at depth 0 returns to the enclosing template literal.
  const tmpl: number[] = [];
  let mode: "code" | "line" | "block" | "s" | "d" | "t" = "code";
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === "code") {
      if (c === "/" && c2 === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "/" && regexStartsAt(out)) {
        const e = regexEnd(src, i);
        if (e > 0) { out += blankRegex(src, i, e); i = e; continue; }
      }
      if (c === "'") { mode = "s"; out += c; i++; continue; }
      if (c === '"') { mode = "d"; out += c; i++; continue; }
      if (c === "`") { mode = "t"; out += c; i++; continue; }
      if (tmpl.length) {
        if (c === "{") tmpl[tmpl.length - 1]++;
        else if (c === "}") {
          if (tmpl[tmpl.length - 1] === 0) { tmpl.pop(); mode = "t"; out += c; i++; continue; }
          tmpl[tmpl.length - 1]--;
        }
      }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } else out += " "; i++; continue; }
    if (mode === "block") {
      if (c === "*" && c2 === "/") { mode = "code"; out += "  "; i += 2; continue; }
      out += blank(c); i++; continue;
    }
    // inside a template literal — KEEP the text: in this codebase a template literal is
    // overwhelmingly EMITTED CODE (compiler/src/runtime-template.js is the whole client runtime
    // as one template; codegen builds output in templates), and an emitted helper is executable.
    // Measured: blanking template text hid 259 runtime definitions in runtime-template.js alone.
    if (mode === "t") {
      if (c === "\\") { out += c + (c2 ?? ""); i += 2; continue; }
      if (c === "$" && c2 === "{") { tmpl.push(0); mode = "code"; out += "${"; i += 2; continue; }
      if (c === "`") mode = "code";
      out += c; i++; continue;
    }
    // inside a '…' / "…" literal — blank the contents (a message string is not code), honoring escapes
    if (c === "\\") { out += " " + (c2 === undefined ? "" : blank(c2)); i += 2; continue; }
    if ((mode === "s" && c === "'") || (mode === "d" && c === '"') || (mode === "t" && c === "`")) {
      mode = "code"; out += c; i++; continue;
    }
    // an unterminated '…' / "…" ends at the line — JS strings cannot span lines, and this keeps
    // a stray quote (in a regex literal, say) from blanking the rest of the file
    if ((mode === "s" || mode === "d") && c === "\n") { mode = "code"; out += c; i++; continue; }
    out += blank(c); i++; continue;
  }
  return out;
}

/**
 * scrml: blank every comment — `//` (§27: universal, markup included), `/* *\/` and `<!-- -->` —
 * and the CONTENTS of every `"…"` literal (string and §4.18.3 display-text literal alike), `'…'`
 * literal, `` `…` `` literal and regex body. Everything else is read as code.
 *
 * WHY NOT A MARKUP/LOGIC SPLIT. A first cut read only `${ … }` blocks and `<program>` bodies as
 * logic and blanked the rest as markup. Measured over every scanned tree it found all but two of
 * 13,666 top-level `fn`/`function` definitions — and the two it missed are the CURRENT surface:
 * a library file whose top level is an item position (`export function toggleMode() …` at file
 * scope, compiler/self-host-v2/slice-m4/src/theme/lib/brand-theme.scrml). A split that
 * approximates the block splitter fails CLOSED on exactly the files the language is moving
 * toward, and a gate that rejects a correct row is the cry-wolf shape (pa-base §8). So the file
 * is read whole; the stated leniency is that a word of FREE markup text (display text that is not
 * a `"…"` literal) counts as an identifier. A path-cited symbol is looked up in that one file, so
 * the leniency is bounded by the file the row names; the bootstrap itself (one `${ }` block per
 * file) has no free text at all.
 *
 * `'…'` ends at the line (a stray apostrophe in display text must not swallow the file); `"…"`
 * may span lines (a display-text literal keeps whitespace exactly, newlines included). A `\"` is
 * honoured as an escape (a logic string has them; a display literal has none, and the cost of
 * reading its trailing `\` as one is a mis-blanked span, never an admitted name).
 */
export function stripScrmlForIdents(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let mode: "code" | "line" | "block" | "html" | "s" | "d" | "t" = "code";
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } else out += " "; i++; continue; }
    if (mode === "block") {
      if (c === "*" && c2 === "/") { mode = "code"; out += "  "; i += 2; continue; }
      out += blank(c); i++; continue;
    }
    if (mode === "html") {
      if (c === "-" && c2 === "-" && src[i + 2] === ">") { mode = "code"; out += "   "; i += 3; continue; }
      out += blank(c); i++; continue;
    }
    if (mode === "s" || mode === "d" || mode === "t") {
      if (c === "\\") { out += " " + (c2 === undefined ? "" : blank(c2)); i += 2; continue; }
      if ((mode === "s" && c === "'") || (mode === "d" && c === '"') || (mode === "t" && c === "`")) {
        mode = "code"; out += c; i++; continue;
      }
      if (mode === "s" && c === "\n") { mode = "code"; out += c; i++; continue; }
      out += blank(c); i++; continue;
    }
    if (c === "/" && c2 === "/") { mode = "line"; out += "  "; i += 2; continue; }
    if (c === "/" && c2 === "*") { mode = "block"; out += "  "; i += 2; continue; }
    if (c === "<" && c2 === "!" && src[i + 2] === "-" && src[i + 3] === "-") { mode = "html"; out += "    "; i += 4; continue; }
    if (c === "/" && regexStartsAt(out)) {
      const e = regexEnd(src, i);
      if (e > 0) { out += blankRegex(src, i, e); i = e; continue; }
    }
    if (c === "'") { mode = "s"; out += c; i++; continue; }
    if (c === '"') { mode = "d"; out += c; i++; continue; }
    if (c === "`") { mode = "t"; out += c; i++; continue; }
    out += c; i++; continue;
  }
  return out;
}

/** The identifiers of a source file's executable text, by extension; null for a non-source file. */
export function identsOfSource(src: string, path: string): Set<string> | null {
  const code = path.endsWith(".scrml") ? stripScrmlForIdents(src)
    : JS_EXT.test(path) ? stripJsForIdents(src)
    : null;
  if (code === null) return null;
  return new Set(code.match(IDENT) ?? []);
}

// -- citation extraction -------------------------------------------------------------------------

const REPO_PATH = String.raw`(?:compiler|scripts|lsp|stdlib)\/[A-Za-z0-9_./-]+?`;
const SYM = String.raw`[A-Za-z_$][A-Za-z0-9_$]*`;
/** Every backticked repo path in a row (a `:line` suffix is not part of the path). */
export const PATH_REF = new RegExp("`(" + REPO_PATH + ")(?::\\d+)?`", "g");

export type Citation = {
  sym: string;
  /** The repo path the symbol is cited IN — checked in that file/dir only; null = tree-wide. */
  path: string | null;
  form: "path-sym" | "path-paren" | "via" | "in";
};

/**
 * The provenance conventions §34 actually uses, and only those (anything looser reads ordinary
 * prose as a symbol claim):
 *   path-sym    `compiler/src/type-system.ts` `checkPrintArgs`
 *   path-paren  `compiler/self-host-v2/css-syntax.scrml` (`parseCssBlock`, …) — the bootstrap form;
 *               only the FIRST backticked name in the parenthesis is the path's symbol
 *   via / in    via `sym` · in `sym` · in the `sym` — tree-wide (no path to scope it to)
 */
const CITATION_RES: { re: RegExp; form: Citation["form"]; hasPath: boolean }[] = [
  { re: new RegExp("`(" + REPO_PATH + ")(?::\\d+)?`\\s+`(" + SYM + ")`", "g"), form: "path-sym", hasPath: true },
  { re: new RegExp("`(" + REPO_PATH + ")(?::\\d+)?`\\s*\\(\\s*`(" + SYM + ")`", "g"), form: "path-paren", hasPath: true },
  { re: new RegExp("\\bvia\\s+`(" + SYM + ")`", "gi"), form: "via", hasPath: false },
  { re: new RegExp("\\bin\\s+(?:the\\s+)?`(" + SYM + ")`", "gi"), form: "in", hasPath: false },
];

/**
 * Backticked prose that is NOT a symbol: pure lowercase_snake_case with no leading underscore —
 * e.g. E-SCHEMA-011's row names the Postgres catalog `pg_constraint`. This codebase has no
 * lowercase_snake function names, and `_scrml_*` keeps its leading underscore, so the filter costs
 * nothing real.
 */
export const NOT_A_SYMBOL = /^[a-z]+(?:_[a-z0-9]+)+$/;

export function extractCitations(row: string): Citation[] {
  const out: Citation[] = [];
  for (const { re, form, hasPath } of CITATION_RES) {
    re.lastIndex = 0;
    for (const m of row.matchAll(re)) {
      const sym = hasPath ? m[2] : m[1];
      if (NOT_A_SYMBOL.test(sym)) continue;
      out.push({ sym, path: hasPath ? m[1] : null, form });
    }
  }
  return out;
}

// -- resolution ----------------------------------------------------------------------------------

export type ResolveCtx = {
  /** Repo root — cited paths are resolved against it. */
  root: string;
  /** Every identifier in executable source across the scanned trees (the tree-wide forms). */
  treeIdents: Set<string>;
};

function walkSources(dir: string, out: string[] = []): string[] {
  let es: string[]; try { es = readdirSync(dir); } catch { return out; }
  for (const e of es) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue;
    const p = join(dir, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkSources(p, out); else if (SOURCE_EXT.test(p)) out.push(p);
  }
  return out;
}

const pathIdentCache = new Map<string, Set<string> | null>();
/**
 * The identifiers of a cited path: a source file's own; a directory's source files' union; null
 * when the path names no source (a non-existent path is reported separately, as a path failure;
 * a non-source file — `.md`, `.json` — cannot vouch for a symbol, so the citation falls back to
 * tree-wide).
 */
export function identsOfPath(root: string, rel: string): Set<string> | null {
  const key = join(root, rel);
  if (pathIdentCache.has(key)) return pathIdentCache.get(key)!;
  let res: Set<string> | null = null;
  try {
    const st = statSync(key);
    const files = st.isDirectory() ? walkSources(key) : [key];
    for (const f of files) {
      const ids = identsOfSource(readFileSync(f, "utf8"), f);
      if (!ids) continue;
      res ??= new Set();
      for (const id of ids) res.add(id);
    }
  } catch { res = null; }
  pathIdentCache.set(key, res);
  return res;
}

/** Every STALE-PROVENANCE reason for one row (empty = resolves). */
export function staleReasons(row: string, ctx: ResolveCtx): string[] {
  const why: string[] = [];
  const missing = new Set<string>();
  PATH_REF.lastIndex = 0;
  for (const m of row.matchAll(PATH_REF)) {
    if (!existsSync(join(ctx.root, m[1]))) {
      missing.add(m[1]);
      why.push(`names \`${m[1]}\`, which does not exist`);
    }
  }
  const seen = new Set<string>();
  for (const c of extractCitations(row)) {
    const key = `${c.path ?? ""}\u0000${c.sym}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (c.path !== null) {
      if (missing.has(c.path)) continue; // already reported as a missing path
      const ids = identsOfPath(ctx.root, c.path);
      if (ids) {
        if (!ids.has(c.sym)) why.push(`names symbol \`${c.sym}\` in \`${c.path}\`, which does not define or use it in executable source`);
        continue;
      }
    }
    if (!ctx.treeIdents.has(c.sym)) why.push(`names symbol \`${c.sym}\`, which appears in no executable source`);
  }
  return why;
}
