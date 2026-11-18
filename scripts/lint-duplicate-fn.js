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
// S479 (s479-import-shadow) — WIDENED TO THE WHOLE §7.6 FILE-SCOPE NAMESPACE, and RUN BY THE BUILD.
//   - The namespace is SPEC §7.6's: "A `let` / `const`, a `function`, a `type` and a user declaration
//     (`<card>`) bound at file scope share one namespace … SHALL be a compile error (E-SCOPE-010:
//     duplicate binding in file scope)", and "a file that imports a name and also declares it is
//     E-SCOPE-010". So a top-level `const` / `let` / `type` counts beside `fn`, and `import * as ns`
//     binds `ns`. (impl#1 on `import { K }` + `const K`: the local wins and the import is dropped.)
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
// WHAT COUNTS AS TOP LEVEL. A `fn` / `function` declaration that is not inside another function's
// body. (`export`, `pure`, `server` … prefixes don't matter: the name is the next token.)
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

const OPEN = { LParen: "RParen", LBracket: "RBracket", LBrace: "RBrace" };
const CLOSE = new Set(["RParen", "RBracket", "RBrace"]);

function matchClose(toks, i) {
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    if (OPEN[toks[j].kind]) depth++;
    else if (CLOSE.has(toks[j].kind)) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

const isFnKw = (t) => t && (t.kind === "KwFn" || t.kind === "KwFunction");
// s479-import-shadow: the other file-scope binders of §7.6 ("A `let` / `const`, a `function`, a `type`
// and a user declaration … bound at file scope share one namespace").
const BINDER = { KwConst: "const", KwLet: "let", KwType: "type" };

/**
 * The top-level names of one scrml source text:
 *   fns:     [{ name, line, col }]           every top-level `fn` / `function`
 *   binds:   [{ name, line, col, kind }]     every top-level `const` / `let` / `type` (kind is the keyword)
 *   imports: [{ name, line, col, from }]     every name an `import { … } from "…"` (or `import * as x`) binds
 */
export function topLevelNames(src) {
  const toks = lex(src).filter((t) => t.kind !== "EOF");
  const fns = [];
  const binds = [];
  const imports = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    // `import * as ns from "…"` binds `ns`
    if (t.kind === "KwImport" && toks[i + 1] && toks[i + 1].text === "*" && toks[i + 2] && toks[i + 2].kind === "KwAs" && toks[i + 3] && toks[i + 3].kind === "Ident") {
      const ns = toks[i + 3];
      const from = toks[i + 4] && toks[i + 4].kind === "KwFrom" && toks[i + 5] ? toks[i + 5].text : "";
      imports.push({ name: ns.text, line: ns.span.line, col: ns.span.col, from: from.replace(/^["']|["']$/g, "") });
      i += 3;
      continue;
    }
    // the native lexer reads `type` as an identifier: a top-level `type Name` is a declaration
    // (a struct field `type: string` is followed by `:`, not by a name)
    const kind = BINDER[t.kind] ?? (t.kind === "Ident" && t.text === "type" ? "type" : undefined);
    if (kind) {
      const name = toks[i + 1];
      if (name && name.kind === "Ident") binds.push({ name: name.text, line: name.span.line, col: name.span.col, kind });
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
        if (bound.kind === "Ident") imports.push({ name: bound.text, line: bound.span.line, col: bound.span.col, from: from.replace(/^["']|["']$/g, "") });
      }
      i = close;
      continue;
    }
    if (!isFnKw(t)) continue;
    const name = toks[i + 1];
    if (!name || name.kind !== "Ident") continue;
    fns.push({ name: name.text, line: name.span.line, col: name.span.col });
    // skip the function: its parameter list, then its body (the first `{` at depth 0 after it)
    if (!toks[i + 2] || toks[i + 2].kind !== "LParen") continue;
    const pclose = matchClose(toks, i + 2);
    if (pclose === -1) continue;
    let depth = 0;
    let body = -1;
    for (let j = pclose + 1; j < toks.length; j++) {
      const k = toks[j].kind;
      if (depth === 0 && k === "LBrace") { body = j; break; }
      if (OPEN[k]) depth++;
      if (CLOSE.has(k)) depth--;
    }
    if (body === -1) continue;
    const bclose = matchClose(toks, body);
    if (bclose === -1) continue;
    i = bclose;
  }
  return { fns, binds, imports };
}

const what = (d) => (d.kind ? `\`${d.kind} ${d.name}\`` : `function \`${d.name}\``);

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
