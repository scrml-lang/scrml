// lowered.js — run the bootstrap front end (lex → parse → analyze → lower, all
// scrml compiled by impl#1) over source files, and the LOWERED Cores of the
// slice programs — the same programs M1 built by hand (slice-m1/*.core.scrml).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dir;

/** A slice source, by path relative to slice-m2/ ("src/app.scrml", "fixtures/…"). */
export function readSlice(rel) {
  return readFileSync(join(HERE, rel), "utf8");
}

/**
 * A path the compiler may be handed: project-relative, `/`-separated, and
 * NORMAL — one spelling per file. An absolute path (or a `\`) would carry the
 * build host's directory layout into diagnostics (SPEC §58.1, no build-host
 * identity in the output); a `.`, `..` or empty segment is a second spelling
 * of a path, under which import sources (resolved to normal paths, link.scrml
 * `resolveFrom`) no longer find the file — the same project would link, and
 * compile, differently.
 */
export function assertProjectRelative(path) {
  const bad = (why) => {
    throw new Error(`the bootstrap front end takes normal project-relative "/"-separated paths (${why}), got ${JSON.stringify(path)}`);
  };
  if (typeof path !== "string" || path === "") bad("empty");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\")) bad("absolute or `\\`");
  for (const seg of path.split("/")) {
    if (seg === "" || seg === "." || seg === "..") bad("a `.`, `..` or empty segment");
  }
}

/**
 * The entry when the driver names none, derived from the SET: a single file is
 * its own entry; otherwise the one file with a top-level `<program>`. Zero or
 * several such files is a driver error — name the entry (no positional default:
 * the result would depend on the list's order).
 */
export function deriveEntry(mods, files) {
  if (files.length === 1) return files[0].path;
  const ps = mods.link.programPaths(files.map((f) => ({ path: f.path, src: f.src })));
  if (ps.length !== 1) {
    throw new Error(`the bootstrap front end cannot derive the entry: ${ps.length} files have a top-level <program> (${ps.join(", ") || "none"}) — pass the entry explicitly`);
  }
  return ps[0];
}

/**
 * Compile a linked program. `files` = [{ path, src }] as a SET — any order:
 * link.scrml `parseProgram` puts them in the canonical order (path order, then
 * link order) so the result is a function of the set and `entry` alone
 * (s452-boot-determinism, SPEC §58.1/§58.12). `entry` is the path of the
 * `<program>` file; omitted, it is derived from the set (`deriveEntry`).
 * Returns every phase's output and timing.
 */
export function frontEnd(mods, files, entry, opts = {}) {
  const seen = new Set();
  for (const f of files) {
    assertProjectRelative(f.path);
    if (seen.has(f.path)) throw new Error(`the bootstrap front end was handed two files named ${JSON.stringify(f.path)} — a project names each file once`);
    seen.add(f.path);
  }
  // s472 (review F2): a path under the stdlib prefix is a stdlib file only when
  // the stdlib driver supplied it (`opts.stdlibPaths`, frontEndStdlib) — the
  // compiler reads stdlib-ness off the path (link.scrml `isStdlibPath`: the
  // `import:host` allow-list, `importTarget`), so a PROJECT file so named is
  // refused here, at the one front door, never compiled as stdlib.
  const refused = prefixedProjectFiles(mods, files, new Set(opts.stdlibPaths ?? []));
  if (refused.length > 0) return refusedFrontEnd(refused);
  if (entry === undefined) entry = deriveEntry(mods, files);
  const t0 = performance.now();
  const linked = mods.link.parseProgram(files.map((f) => ({ path: f.path, src: f.src })), entry);
  const asts = linked.files;
  const next = linked.nextId;
  const t1 = performance.now();
  // s474 r1 (review F1): `opts.keyBase` — the files' root under the PROJECT root, which the per-file
  // output keys hash from (core.scrml fileKeyPath); the reported file names stay `f.path`
  const tp = mods.analyze.analyzeKeyed(asts, entry, opts.keyBase ?? "");
  // s469 — a statement a later phase refuses is not also E-STMT-NO-EFFECT (parse.scrml withoutRefusedNoEffect)
  const parseDiags0 = mods.parse.withoutRefusedNoEffect(linked.diags, tp.diags);
  // s473 D28 — the named-refusal table (refusals.scrml): in a file that already fails, a construct
  // the bootstrap does not build is reported by name and the generic cascade it caused is dropped.
  // Re-label only: it never adds an error to a file that had none (Core is lowered from `tp` as before).
  const rel = mods.refusals.relabelRefusals(files.map((f) => ({ path: f.path, src: f.src })), parseDiags0, tp.diags);
  const parseDiags = rel.parse;
  const t2 = performance.now();
  const lowered = mods.lower.lower(tp);
  const t3 = performance.now();
  return {
    asts,
    typed: tp,
    core: lowered.core,
    // the parse phase's diagnostics, apart (the conformance probe buckets on them)
    parseDiags,
    diags: parseDiags.concat(rel.later),
    // s449: the non-fatal I- notes (§55.17.6: I-FORM-SUBMIT-GATED "reports in the warnings stream")
    infos: tp.infos,
    nodes: next,
    ms: { parse: t1 - t0, analyze: t2 - t1, lower: t3 - t2, total: t3 - t0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// s471 — `scrml:` stdlib modules, supplied as SOURCE through the front end's
// ordinary module path (SPEC §41.3–§41.5). A stdlib module is just another
// `.scrml` module with a fixed location: its files join the compile set under
// link.scrml's stdlib prefix (`stdlib/format/index.scrml` is
// `scrml:format/index.scrml`), and link.scrml `importTarget` — the one
// resolver — finds them. Nothing here reads source text: the imports are the
// bootstrap parser's own (parse.scrml `parseFile`, link.scrml `importsOfItems`).
// ─────────────────────────────────────────────────────────────────────────────

/** The compiler-bundled stdlib (§41.5 tier 1): `<repo>/stdlib`. */
export const STDLIB_ROOT = join(HERE, "..", "..", "..", "stdlib");

// A `scrml:` module name the stdlib can hold: `/`-separated lower-case segments
// (`format`, `auth/jwt`) — never `.`, `..` or an empty segment, so a name can
// only ever name a file under the stdlib root.
const STDLIB_NAME = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** The `scrml:compiler` family is KNOWN-DEFERRED (§41.17): never supplied; analyze refuses it by name. */
function deferredStdlib(name) {
  return name === "compiler" || name.startsWith("compiler/");
}

function stdlibFile(root, rel) {
  const abs = join(root, ...rel.split("/"));
  return existsSync(abs) ? abs : null;
}

/**
 * The stdlib sources a source set imports, transitively, as front-end inputs:
 * `{ sources: [{ path, src, abs }], modules: Map<name, Set<path>> }` — `path` the
 * prefixed project path the compiler sees, `abs` the file on disk (for a driver's
 * diagnostics), and per imported module the set of stdlib paths its closure
 * reaches. A module named in `exclude`, the deferred `scrml:compiler` family, a
 * name that is not a stdlib name, or a module with no file under `root` is not
 * supplied — so its import resolves to nothing and analyze refuses it by name.
 */
/**
 * s473 (#1658 review F2) — the import specifiers (`from`) of one file, in source order, read by
 * the bootstrap parser (parse.scrml `parseFile` + link.scrml `importsOfItems`). The result depends
 * on `src` alone (`path` reaches only diagnostic spans), so it is memoised by the text: a driver
 * that shares one reader between its own import closure and the front end parses each file for its
 * imports once. One reader per compile — the memo holds every text it was given.
 */
export function importFroms(mods) {
  const memo = new Map(); // src → string[]
  return (path, src) => {
    let r = memo.get(src);
    if (r === undefined) {
      r = mods.link.importsOfItems(mods.parse.parseFile(path, src, 0).ast.items).map((imp) => String(imp.from));
      memo.set(src, r);
    }
    return r;
  };
}

export function stdlibSources(mods, files, opts = {}) {
  const root = opts.stdlibRoot ?? STDLIB_ROOT;
  const exclude = opts.exclude ?? new Set();
  const prefix = mods.link.stdlibPrefix();
  const byPath = new Map(); // stdlib path → { path, src, abs }
  const modules = new Map(); // module name → Set<stdlib path>
  // the stdlib paths `file` imports (a module name per `scrml:` import; a relative one inside the prefix)
  // s473 (#1658 review F2): `opts.importFroms` — a driver's own memoised reader of a file's import
  // specifiers (scripts/scrml-boot.ts importReader), so a file the driver already parsed to follow
  // its imports is not parsed again here. Default: the bootstrap parser, as below.
  const fromsOf = opts.importFroms ?? importFroms(mods);
  const importsOf = (path, src) => {
    const out = [];
    for (const from of fromsOf(path, src)) {
      if (from.startsWith(prefix)) {
        const name = from.slice(prefix.length);
        if (!STDLIB_NAME.test(name) || deferredStdlib(name) || exclude.has(name)) continue;
        const rel = stdlibFile(root, `${name}/index.scrml`) ? `${name}/index.scrml` : stdlibFile(root, `${name}.scrml`) ? `${name}.scrml` : null;
        if (rel !== null) out.push({ module: name, path: prefix + rel });
      } else if (path.startsWith(prefix) && (from.startsWith("./") || from.startsWith("../"))) {
        const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        const p = String(mods.link.resolveFrom(dir, from));
        if (p.startsWith(prefix) && stdlibFile(root, p.slice(prefix.length))) out.push({ module: null, path: p });
      }
    }
    return out;
  };
  const reach = (module, path) => {
    const todo = [path];
    const seen = modules.get(module) ?? new Set();
    modules.set(module, seen);
    while (todo.length > 0) {
      const p = todo.pop();
      if (seen.has(p)) continue;
      seen.add(p);
      let entry = byPath.get(p);
      if (entry === undefined) {
        const abs = join(root, ...p.slice(prefix.length).split("/"));
        entry = { path: p, src: readFileSync(abs, "utf8"), abs };
        byPath.set(p, entry);
      }
      for (const t of importsOf(entry.path, entry.src)) {
        // a relative import is this module's own file; a `scrml:` one is another module, judged on
        // its own — withdrawn, its import here is refused in THIS module's file, which withdraws this one
        if (t.module === null) todo.push(t.path);
        else if (!modules.has(t.module)) reach(t.module, t.path);
      }
    }
  };
  const direct = new Set(); // the modules a project file itself imports
  for (const f of files) {
    for (const t of importsOf(f.path, f.src)) {
      if (t.module === null) continue;
      direct.add(t.module);
      if (!modules.has(t.module)) reach(t.module, t.path);
    }
  }
  return { sources: [...byPath.values()], modules, direct };
}

const isError = (d) => String(d.severity ?? "").toLowerCase() === "error";

/** The files in `files` named under the stdlib prefix that are not in `stdlibPaths`. */
function prefixedProjectFiles(mods, files, stdlibPaths) {
  const prefix = mods.link.stdlibPrefix();
  return files.filter((f) => String(f.path).startsWith(prefix) && !stdlibPaths.has(f.path));
}

/**
 * A compile refused before any phase runs: one E-BOOTSTRAP-UNSUPPORTED per
 * project file named under the stdlib prefix (a project directory named
 * `scrml:x/` on a filesystem that allows `:`). Bootstrap-local: the SPEC names
 * no code for a project path that collides with the `scrml:` specifier space
 * (§41.4); it fails closed, as a diagnostic — not a driver crash (s471 threw).
 */
function refusedFrontEnd(files) {
  const diags = files.map((f) => ({
    code: "E-BOOTSTRAP-UNSUPPORTED",
    severity: "Error",
    file: f.path,
    span: { start: 0, end: 0 },
    message: `the project file ${JSON.stringify(f.path)} is named under the stdlib prefix \`scrml:\` — that name space is the standard library's (\`scrml:NAME\` imports, §41.4), so a project file named in it would be read as a stdlib file; rename the directory`,
  }));
  return { asts: [], typed: null, core: null, parseDiags: [], diags, infos: [], nodes: 0, ms: { parse: 0, analyze: 0, lower: 0, total: 0 } };
}

/**
 * `frontEnd` over `files` and the `scrml:` stdlib modules they import. A stdlib
 * module is importable BY CONSTRUCTION when its source compiles on the bootstrap:
 * a module whose files carry an Error diagnostic is withdrawn (with every module
 * whose closure holds such a file) and the compile re-run without it, until no
 * stdlib file carries one — so a withdrawn module's import is refused BY NAME at
 * the import (analyze.scrml checkImports), never a wall of errors in a file the
 * user did not write. Returns `frontEnd`'s result (its diagnostics the user's
 * files' only), plus `stdlib: { supplied: [{ module, files }], sources, refused:
 * [{ module, direct, diags, sources }] }` — `diags` the withdrawn module's own
 * Error diagnostics (each in one of its `sources`, by `path`; `abs` is the file on
 * disk), `direct` whether a project file imports it itself — for a driver to say why.
 */
export function frontEndStdlib(mods, files, entry, opts = {}) {
  const prefix = mods.link.stdlibPrefix();
  // s472 (review F2): a project file named under the prefix is a named refusal (frontEnd), not a throw
  const named = prefixedProjectFiles(mods, files, new Set());
  if (named.length > 0) return { ...refusedFrontEnd(named), stdlib: { supplied: [], sources: [], refused: [] } };
  const exclude = new Set(opts.exclude ?? []);
  const refused = [];
  // one reader for every round (a withdrawn module re-runs the search over the same texts)
  const readFroms = opts.importFroms ?? importFroms(mods);
  for (;;) {
    const std = stdlibSources(mods, files, { stdlibRoot: opts.stdlibRoot, exclude, importFroms: readFroms });
    const r = frontEnd(mods, [...files, ...std.sources.map((s) => ({ path: s.path, src: s.src }))], entry, { stdlibPaths: std.sources.map((s) => s.path), keyBase: opts.keyBase });
    const bad = new Map(); // module → its Error diagnostics
    for (const d of r.diags) {
      if (!isError(d) || !String(d.file ?? "").startsWith(prefix)) continue;
      for (const [m, paths] of std.modules) {
        if (paths.has(d.file)) bad.set(m, [...(bad.get(m) ?? []), d]);
      }
    }
    if (bad.size === 0) {
      const mine = (d) => !String(d.file ?? "").startsWith(prefix);
      return {
        ...r,
        diags: r.diags.filter(mine),
        parseDiags: r.parseDiags.filter(mine),
        infos: (r.infos ?? []).filter(mine),
        stdlib: {
          supplied: [...std.modules].map(([module, paths]) => ({ module, files: [...paths].sort() })),
          sources: std.sources,
          refused,
        },
      };
    }
    for (const [m, ds] of [...bad].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      exclude.add(m);
      refused.push({ module: m, direct: std.direct.has(m), diags: ds, sources: std.sources.filter((s) => std.modules.get(m)?.has(s.path)) });
    }
  }
}

/**
 * A project on disk as the front end's input: every `.scrml` file under
 * `root`, each named by its path RELATIVE to `root` ("/"-separated). The list is
 * in whatever order the filesystem enumerates — deliberately unsorted: the
 * front end canonicalizes (link.scrml), so neither enumeration order nor where
 * `root` sits on disk (nor the working directory) reaches the compile.
 */
export function projectSources(root, dir = "") {
  const out = [];
  for (const e of readdirSync(dir === "" ? root : join(root, dir), { withFileTypes: true })) {
    const rel = dir === "" ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...projectSources(root, rel));
    else if (e.name.endsWith(".scrml")) out.push({ path: rel, src: readFileSync(join(root, rel), "utf8") });
  }
  return out;
}

// The slice programs, as sources. `lib` is the §66.19.3 library.
const LIB = { path: "lib/dropdown.scrml", rel: "src/lib/dropdown.scrml" };
export const PROGRAMS = {
  counter: [{ path: "counter.scrml", rel: "src/counter.scrml" }],
  dropdown: [LIB, { path: "app.scrml", rel: "src/app.scrml" }],
  dropdownReorder: [LIB, { path: "app-reorder.scrml", rel: "fixtures/app-reorder.scrml" }],
  dropdownEarlyRead: [LIB, { path: "app-early.scrml", rel: "fixtures/app-early.scrml" }],
  valuesem: [{ path: "valuesem.scrml", rel: "fixtures/valuesem.scrml" }],
};

export function compileProgram(mods, name) {
  const files = PROGRAMS[name].map((f) => ({ path: f.path, src: readSlice(f.rel) }));
  const r = frontEnd(mods, files);
  if (r.diags.length > 0) {
    throw new Error(`the bootstrap front end reported diagnostics for ${name}:\n` + r.diags.map((d) => `${d.code} ${d.file}@${d.span.start}: ${d.message}`).join("\n"));
  }
  return r;
}

/** The lowered Cores, with the same names as the hand-built providers. */
export function loweredCores(mods) {
  return {
    counter: () => compileProgram(mods, "counter").core,
    dropdown: () => compileProgram(mods, "dropdown").core,
    dropdownReorder: () => compileProgram(mods, "dropdownReorder").core,
    dropdownEarlyRead: () => compileProgram(mods, "dropdownEarlyRead").core,
    valuesem: () => compileProgram(mods, "valuesem").core,
  };
}
