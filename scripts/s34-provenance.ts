/**
 * s34-provenance.ts — the §34.0 provenance RESOLVER, as pure functions (so it can be tested
 * without running the census, which reads SPEC.md and walks the tree at import time).
 *
 * Used by scripts/s34-census.ts `--check-new` (CI: new/changed rows) and `--check-all` (every
 * §34 row — the measurement mode).
 *
 * WHAT IT ANSWERS. A §34 row's provenance note must RESOLVE (S364 trap T8): every backticked repo
 * path must exist, and every symbol the row names must exist in source — in THE FILE the row
 * names, when it names one.
 *
 * WHY THIS FILE EXISTS (S474, g-s34-census-symbol-check-ignores-scrml-s474). The resolver it
 * replaces was hollow for the bootstrap in two ways at once:
 *   1. identifiers were collected from `.ts`/`.js`/`.mjs` only, though the census walks
 *      `compiler/self-host-v2` — so a CORRECT row naming a bootstrap function
 *      (`compiler/self-host-v2/analyze.scrml` `resolveSlot`) failed as STALE PROVENANCE;
 *   2. the workaround form `` `…analyze.scrml` (`resolveSlot`) `` passed only because the
 *      resolver did not parse the parenthesized form at all — so NO bootstrap symbol cited in any
 *      §34 row was checked, and a renamed bootstrap function passed silently.
 * Now: both forms resolve (with their `, `-joined lists), a bare filename resolves to a real path
 * or fails, and a symbol cited WITH a path is looked up in THAT file — not anywhere in the tree.
 *
 * WHAT COUNTS AS AN IDENTIFIER: source text with COMMENTS blanked. Literal contents COUNT — in a
 * compiler, string and template literals are EMITTED CODE: codegen defines runtime helpers on
 * quoted-string lines (compiler/src/codegen/sqlite-file-target.ts defines `_scrml_sqlite_path` only
 * inside `"function _scrml_sqlite_path(dbPath) {",`; emit-server.ts emits the CSRF / rate-limit /
 * security-header helpers the same way). An S474 first cut blanked '…'/"…" contents and made 52 of
 * 118 such `_scrml_*` helpers invisible — every correct row citing one would have failed (S474
 * review F1). The strictness gain is the PER-FILE scoping instead: a renamed function must
 * survive, in the cited file, as more than a comment.
 *
 * WHAT DOES NOT VOUCH FOR A TREE-WIDE NAME: test trees (isTestPath). A test file's fake names
 * (`resolveSlotRenamed`, `ghostFn`) would otherwise make a bogus "via `ghostFn`" row pass (S474
 * review F2). A test file CITED BY PATH is still read — the row named it.
 *
 * KNOWN LENIENCIES (stated, not hidden; each only ever ADMITS a name, never rejects a correct row):
 *   - a name surviving only in a string / display-text literal / free markup text of the cited
 *     file (or, tree-wide, any non-test file) counts;
 *   - other citation spellings (`→`, `’s`, `a/b`, `(line 3, …)`) are not parsed — gap
 *     g-s34-census-unparsed-citation-spellings-s474.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

export const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/g;
export const SOURCE_EXT = /\.(ts|js|mjs|scrml)$/;
const JS_EXT = /\.(ts|js|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Keep the character's line structure (newline stays, anything else becomes a space). */
const blank = (c: string) => (c === "\n" ? "\n" : " ");

/**
 * A TEST path (repo-relative, `/`-separated): under `compiler/tests/`, or an `acceptance` /
 * `fixtures` / `__tests__` directory, or a `*.test.*` / `*.spec.*` file. Its identifiers never
 * vouch for a tree-wide citation, and a bare filename is never resolved to it.
 * NOT a generic `test/` rule: `stdlib/test/index.scrml` is a SHIPPING module (`scrml:test`).
 */
export function isTestPath(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  if (p.startsWith("compiler/tests/")) return true;
  if (/(?:^|\/)(?:__tests__|fixtures|acceptance)\//.test(p)) return true;
  return /\.(?:test|spec)\.[A-Za-z]+$/.test(p);
}

const REGEX_PREV_KEYWORD = /(?:^|[^A-Za-z0-9_$])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await|instanceof)$/;
/**
 * At a `/` (not `//`, not `/*`) in code: is it a REGEX LITERAL opener? The usual heuristic — a regex
 * follows an operator, an opening bracket, a separator, a keyword or the start of input; a
 * division follows an operand (identifier, number, `)`, `]`). `}` is read as division.
 * WHY: a regex literal holding a quote or backtick (protect-egress.ts `foldIdent`'s
 * /…"…`…/) otherwise opens a string, and a `//` inside that "string" is then never seen as the
 * comment it may be — or worse, a real comment is read as string. The regex text is kept verbatim.
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

/**
 * JS/TS: blank `//` and `/* *\/` comments; keep everything else verbatim. Literals (string,
 * template — including the code in a template's `${ … }` — and regex) are TRACKED so a `//` or
 * `/*` inside one is not mistaken for a comment, and a comment's quote does not open a literal.
 * Offsets and line count are preserved.
 */
export function stripJsForIdents(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  // Template-literal interpolation brace depths: a `}` at depth 0 returns to the template.
  const tmpl: number[] = [];
  let mode: "code" | "line" | "block" | "s" | "d" | "t" = "code";
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === "code") {
      if (c === "/" && c2 === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "/" && regexStartsAt(out)) {
        const e = regexEnd(src, i);
        if (e > 0) { out += src.slice(i, e); i = e; continue; }
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
    // inside a literal — copy verbatim, honoring escapes
    if (c === "\\") { out += c + (c2 ?? ""); i += 2; continue; }
    if (mode === "t" && c === "$" && c2 === "{") { tmpl.push(0); mode = "code"; out += "${"; i += 2; continue; }
    if ((mode === "s" && c === "'") || (mode === "d" && c === '"') || (mode === "t" && c === "`")) mode = "code";
    // an unterminated '…' / "…" ends at the line (JS strings cannot span lines), so a stray quote
    // cannot hide every later comment from the stripper
    else if ((mode === "s" || mode === "d") && c === "\n") mode = "code";
    out += c; i++; continue;
  }
  return out;
}

/**
 * scrml: blank every comment — `//` (§27: universal, markup included), `/* *\/` and `<!-- -->` —
 * and keep everything else verbatim. `"…"`, `'…'` and `` `…` `` literals are tracked only so a
 * comment opener inside one is not taken for a comment.
 *
 * The file is read WHOLE, not split into markup and logic: a split approximating the block
 * splitter missed the current item-position surface (`export function toggleMode() …` at file
 * scope, compiler/self-host-v2/slice-m4/src/theme/lib/brand-theme.scrml) — failing closed on the
 * files the language is moving toward. `'…'` ends at the line (a stray apostrophe in display text
 * must not hide every later comment); `"…"` may span lines (a display-text literal keeps
 * newlines). Parity edge cases vs the real scrml tokenizer: gap g-s34-census-scrml-stripper-parity-s474.
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
      if (c === "\\") { out += c + (c2 ?? ""); i += 2; continue; }
      if ((mode === "s" && c === "'") || (mode === "d" && c === '"') || (mode === "t" && c === "`")) mode = "code";
      else if (mode === "s" && c === "\n") mode = "code";
      out += c; i++; continue;
    }
    if (c === "/" && c2 === "/") { mode = "line"; out += "  "; i += 2; continue; }
    if (c === "/" && c2 === "*") { mode = "block"; out += "  "; i += 2; continue; }
    if (c === "<" && c2 === "!" && src[i + 2] === "-" && src[i + 3] === "-") { mode = "html"; out += "    "; i += 4; continue; }
    if (c === "/" && regexStartsAt(out)) {
      const e = regexEnd(src, i);
      if (e > 0) { out += src.slice(i, e); i = e; continue; }
    }
    if (c === "'") { mode = "s"; out += c; i++; continue; }
    if (c === '"') { mode = "d"; out += c; i++; continue; }
    if (c === "`") { mode = "t"; out += c; i++; continue; }
    out += c; i++; continue;
  }
  return out;
}

/** The identifiers of a source file's comment-stripped text, by extension; null for a non-source file. */
export function identsOfSource(src: string, path: string): Set<string> | null {
  const code = path.endsWith(".scrml") ? stripScrmlForIdents(src)
    : JS_EXT.test(path) ? stripJsForIdents(src)
    : null;
  if (code === null) return null;
  return new Set(code.match(IDENT) ?? []);
}

// -- citation extraction -------------------------------------------------------------------------

const REPO_PATH = String.raw`(?:compiler|scripts|lsp|stdlib)\/[A-Za-z0-9_./-]+?`;
const BARE_FILE = String.raw`[A-Za-z0-9_.-]+\.(?:ts|js|mjs|scrml)`;
const SYM = String.raw`[A-Za-z_$][A-Za-z0-9_$]*`;
/** Every backticked repo path in a row (a `:line` suffix is not part of the path). */
export const PATH_REF = new RegExp("`(" + REPO_PATH + ")(?::\\d+)?`", "g");

export type Citation = {
  sym: string;
  /** The repo path the symbol is cited IN — checked in that file only; null = tree-wide. */
  path: string | null;
  /** For a bare-filename citation: the filename as written (`path` is then null until resolved). */
  bare?: string;
  /** Offset of the citation in the row (a bare filename resolves against the paths BEFORE it). */
  at: number;
  form: "path-sym" | "path-paren" | "bare-sym" | "bare-paren" | "via" | "in";
};

/**
 * The provenance conventions §34 actually uses, and only those (anything looser reads ordinary
 * prose as a symbol claim):
 *   path-sym    `compiler/src/type-system.ts` `checkPrintArgs`
 *   path-paren  `compiler/self-host-v2/css-syntax.scrml` (`parseCssBlock`, …) — the bootstrap
 *               form. Every name of a LIST at the head of the parenthesis belongs to the path —
 *               (`a`, `b` / `c` + `d` and `e`, …) — up to the first prose word / `via` / `from`.
 *   bare-sym, bare-paren — the same with a bare filename: `parse.scrml` `parseCssNode`
 *   via / in    via `sym` · in `sym` · in the `sym` — tree-wide (no path to scope it to)
 * A bare filename is a `` `name.ext` `` with no `/` — the `[A-Za-z0-9_.-]` class cannot match a
 * repo path, so the two families never claim the same text.
 */
const CITATION_RES: { re: RegExp; form: Citation["form"]; kind: "path" | "bare" | "none"; list: boolean }[] = [
  { re: new RegExp("`(" + REPO_PATH + ")(?::\\d+)?`\\s+`(" + SYM + ")`", "g"), form: "path-sym", kind: "path", list: false },
  { re: new RegExp("`(" + REPO_PATH + ")(?::\\d+)?`\\s*\\(\\s*`(" + SYM + ")`", "g"), form: "path-paren", kind: "path", list: true },
  { re: new RegExp("`(" + BARE_FILE + ")(?::\\d+)?`\\s+`(" + SYM + ")`", "g"), form: "bare-sym", kind: "bare", list: false },
  { re: new RegExp("`(" + BARE_FILE + ")(?::\\d+)?`\\s*\\(\\s*`(" + SYM + ")`", "g"), form: "bare-paren", kind: "bare", list: true },
  { re: new RegExp("\\bvia\\s+`(" + SYM + ")`", "gi"), form: "via", kind: "none", list: false },
  { re: new RegExp("\\bin\\s+(?:the\\s+)?`(" + SYM + ")`", "gi"), form: "in", kind: "none", list: false },
];
/** One list continuation inside a citation parenthesis: `, ` / ` / ` / ` + ` / ` and ` then a name. */
const LIST_NEXT = new RegExp("\\s*(?:,|\\/|\\+|\\band\\b)\\s*`(" + SYM + ")`", "y");

/**
 * Backticked prose that is NOT a symbol: pure lowercase_snake_case with no leading underscore —
 * e.g. E-SCHEMA-011's row names the Postgres catalog `pg_constraint`. This codebase has no
 * lowercase_snake function names, and `_scrml_*` keeps its leading underscore, so the filter costs
 * nothing real.
 */
export const NOT_A_SYMBOL = /^[a-z]+(?:_[a-z0-9]+)+$/;

export function extractCitations(row: string): Citation[] {
  const out: Citation[] = [];
  for (const { re, form, kind, list } of CITATION_RES) {
    re.lastIndex = 0;
    for (const m of row.matchAll(re)) {
      const syms = [kind === "none" ? m[1] : m[2]];
      if (list) {
        LIST_NEXT.lastIndex = (m.index ?? 0) + m[0].length;
        for (let k; (k = LIST_NEXT.exec(row)); ) syms.push(k[1]);
      }
      for (const sym of syms) {
        if (NOT_A_SYMBOL.test(sym)) continue;
        out.push({
          sym, at: m.index ?? 0, form,
          path: kind === "path" ? m[1] : null,
          ...(kind === "bare" ? { bare: m[1] } : {}),
        });
      }
    }
  }
  return out;
}

// -- resolution ----------------------------------------------------------------------------------

export type ResolveCtx = {
  /** Repo root — cited paths are resolved against it. */
  root: string;
  /** Every identifier in comment-stripped source across the scanned trees, test trees EXCLUDED
   *  (the tree-wide forms). */
  treeIdents: Set<string>;
  /** basename → repo-relative paths of every non-test source file (bare-filename resolution).
   *  Built on first need when absent. */
  basenames?: Map<string, string[]>;
};

function walkSources(dir: string, out: string[] = []): string[] {
  let es: string[]; try { es = readdirSync(dir); } catch { return out; }
  for (const e of es) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkSources(p, out); else if (SOURCE_EXT.test(p)) out.push(p);
  }
  return out;
}

/** The source trees the census scans (emitter tokens, T2/T3) and the resolver reads identifiers
 *  from. compiler/tests is scanned for tokens but never vouches for a tree-wide name (isTestPath). */
export const SCAN_ROOTS = ["compiler/src", "compiler/native-parser", "compiler/runtime", "compiler/scripts",
  "compiler/self-host-v2", "lsp", "scripts", "stdlib", "compiler/tests"];

/**
 * Every identifier in comment-stripped NON-TEST source under `roots` — the set the tree-wide
 * citation forms (via / in) resolve against. A TEST file never vouches (S474 review F2: a test's
 * fake names — `resolveSlotRenamed`, `ghostFn` — made a bogus "via `ghostFn`" row pass). A test
 * file cited BY PATH is still read: the row named it.
 */
export function buildTreeIdents(root: string, roots: string[] = SCAN_ROOTS): Set<string> {
  const ids = new Set<string>();
  for (const r of roots) {
    for (const f of walkSources(join(root, r))) {
      if (isTestPath(relative(root, f))) continue;
      let src: string; try { src = readFileSync(f, "utf8"); } catch { continue; }
      for (const id of identsOfSource(src, f) ?? []) ids.add(id);
    }
  }
  return ids;
}

/**
 * basename → repo-relative (`/`-separated) paths of every NON-TEST source file in the SCANNED
 * trees (SCAN_ROOTS) — never the whole repo. S474 review N1: a whole-repo walk read the main
 * checkout's `.claude/worktrees/*` (two dozen full copies of compiler/src), so every bare citation
 * became "ambiguous" and the pre-commit hook went red for every commit from the main checkout
 * while any worktree existed; even without worktrees, docs/changes probes, benchmarks and
 * examples made 90 of 3441 basenames ambiguous. Every bare citation in §34 names a scanned-tree file.
 */
export function buildBasenameIndex(root: string, roots: string[] = SCAN_ROOTS): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const f of roots.flatMap((r) => walkSources(join(root, r)))) {
    const rel = relative(root, f).replace(/\\/g, "/");
    if (isTestPath(rel)) continue;
    const b = basename(f);
    idx.set(b, [...(idx.get(b) ?? []), rel]);
  }
  return idx;
}

const pathIdentCache = new Map<string, Set<string> | null>();
/** The identifiers of a cited SOURCE FILE; null when the path is not a source file (a directory,
 *  `.md`, `.sh`, …) or cannot be read. */
export function identsOfPath(root: string, rel: string): Set<string> | null {
  const key = join(root, rel);
  if (pathIdentCache.has(key)) return pathIdentCache.get(key)!;
  let res: Set<string> | null = null;
  try {
    if (SOURCE_EXT.test(key) && statSync(key).isFile()) res = identsOfSource(readFileSync(key, "utf8"), key);
  } catch { res = null; }
  pathIdentCache.set(key, res);
  return res;
}

/**
 * Resolve a BARE filename cited at offset `at` of `row`:
 *   1. the SIBLING of the last full repo path cited before it, when that file exists
 *      (E-CSS-SYNTAX: `compiler/self-host-v2/css-syntax.scrml` (… via `parse.scrml` …) — parse.scrml
 *      is ambiguous repo-wide, the sibling rule picks compiler/self-host-v2/parse.scrml);
 *   2. else the UNIQUE non-test source file of that name in the repo;
 *   3. else an error — the row must give the full path.
 */
export function resolveBare(name: string, row: string, at: number, ctx: ResolveCtx): { path: string; how: string } | { error: string } {
  let last: string | null = null;
  PATH_REF.lastIndex = 0;
  for (const m of row.matchAll(PATH_REF)) { if ((m.index ?? 0) < at) last = m[1]; }
  if (last) {
    const dir = last.endsWith("/") ? last.slice(0, -1) : dirname(last).replace(/\\/g, "/");
    const sib = `${dir}/${name}`;
    if (existsSync(join(ctx.root, sib))) return { path: sib, how: `\`${name}\` resolved as sibling of \`${last}\`` };
  }
  ctx.basenames ??= buildBasenameIndex(ctx.root);
  const hits = ctx.basenames.get(name) ?? [];
  if (hits.length === 1) return { path: hits[0], how: `\`${name}\` resolved as the only scanned non-test file of that name` };
  return {
    error: hits.length
      ? `names bare filename \`${name}\`, which is ambiguous (${hits.length} files: ${hits.slice(0, 4).join(", ")}${hits.length > 4 ? ", …" : ""}) — give the full path`
      : `names bare filename \`${name}\`, which matches no non-test source file in the scanned trees — give the full path`,
  };
}

/** Every STALE-PROVENANCE reason for one row (empty = resolves). */
export function staleReasons(row: string, ctx: ResolveCtx): string[] {
  const why: string[] = [];
  const missing = new Set<string>();
  PATH_REF.lastIndex = 0;
  for (const m of row.matchAll(PATH_REF)) {
    if (!existsSync(join(ctx.root, m[1]))) {
      if (!missing.has(m[1])) why.push(`names \`${m[1]}\`, which does not exist`);
      missing.add(m[1]);
    }
  }
  const seen = new Set<string>();
  const bareErrs = new Set<string>();
  for (const c of extractCitations(row)) {
    let path = c.path;
    let how = "";
    if (c.bare !== undefined) {
      const r = resolveBare(c.bare, row, c.at, ctx);
      if ("error" in r) { if (!bareErrs.has(r.error)) why.push(r.error); bareErrs.add(r.error); continue; }
      path = r.path;
      how = ` (${r.how})`;
    }
    const key = `${path ?? ""}\u0000${c.sym}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (path === null) {
      if (!ctx.treeIdents.has(c.sym)) why.push(`names symbol \`${c.sym}\`, which appears in no non-test source (comments excluded)`);
      continue;
    }
    if (missing.has(path)) continue; // already reported as a missing path
    const ids = identsOfPath(ctx.root, path);
    if (!ids) { why.push(`names symbol \`${c.sym}\` in \`${path}\`${how}, which is not a source file — cite the source file`); continue; }
    if (!ids.has(c.sym)) why.push(`names symbol \`${c.sym}\` in \`${path}\`${how}, which does not contain it outside comments`);
  }
  return why;
}
