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
  // output keys hash from (core.scrml fileKeyPath); the reported file names stay `f.path`.
  // s474 (client-bang composition): `next` — the linker's first unused node id (composeFiles)
  // s475 r1: the sources too — analysis re-reads a file whose `m.x` it resolved to a namespace member
  // s477 fix round 1 (F3): `opts.routeBase` — the files' root as the driver knows it (scrml-boot: its
  // absolute path), which a build with no `<program>` reads route files against (§40.8 "anywhere in
  // their path"); without one, keyBase (the root under the project root) is read, as before.
  const tp = mods.analyze.analyzeSources(asts, files.map((f) => ({ path: f.path, src: f.src })), entry, opts.keyBase ?? "", opts.routeBase ?? opts.keyBase ?? "", next);
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
  // s474 r1 (review L5): when a client `!` function composed, the analyzed program is the COMPOSED
  // one (analyze.scrml composeFiles) — its files and its node count are the ones every later sweep sees
  const composed = tp.files !== asts;
  return {
    asts: composed ? tp.files : asts,
    typed: tp,
    core: lowered.core,
    // the parse phase's diagnostics, apart (the conformance probe buckets on them)
    parseDiags,
    diags: parseDiags.concat(rel.later),
    // s449: the non-fatal I- notes (§55.17.6: I-FORM-SUBMIT-GATED "reports in the warnings stream")
    infos: tp.infos,
    nodes: composed ? Math.max(next, maxNid(tp.files) + 1) : next,
    ms: { parse: t1 - t0, analyze: t2 - t1, lower: t3 - t2, total: t3 - t0 },
  };
}

/** s474 r1 (review L5): the largest node id anywhere in `x` (an AST value; -1 for none). */
function maxNid(x) {
  let top = -1;
  const todo = [x];
  while (todo.length > 0) {
    const v = todo.pop();
    if (v === null || typeof v !== "object") continue;
    if (Array.isArray(v)) { for (const e of v) todo.push(e); continue; }
    if (typeof v.nid === "number" && v.nid > top) top = v.nid;
    for (const k in v) todo.push(v[k]);
  }
  return top;
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
 * s473 (#1658 review F2) — the import specifiers (`from`) of one file, in source order, read by
 * the bootstrap parser (parse.scrml `parseFile` + link.scrml `linkFromsOfItems` — s478: its imports
 * AND its re-exports, §21.4 "SHALL link its source module exactly as an `import`"). The result depends
 * on `src` alone (`path` reaches only diagnostic spans), so it is memoised by the text: a driver
 * that shares one reader between its own import closure and the front end parses each file for its
 * imports once. One reader per compile — the memo holds every text it was given.
 * s478 (ruled-stdlib-data): the reader also carries `.links` — the same statements in full (which
 * names each binds, and where), from the same memo — for the per-name barrel supply below.
 */
export function importFroms(mods) {
  const links = importLinks(mods);
  const read = (path, src) => links(path, src).map((l) => l.from);
  read.links = links;
  return read;
}

/**
 * s478 (ruled-stdlib-data) — a file's LINKING statements (link.scrml `linkFromsOfItems`: its imports
 * and its re-exports, in source order), as plain records: `{ from, re, ns, span, names: [{ name,
 * orig, span }] }` — `re` the ALink variant name (`Import`, `Reexport`, `ReexportAll`), `ns` a
 * namespace import's local name ("" for any other), `orig` the name the source module exports.
 * Memoised by the text, as `importFroms`.
 */
export function importLinks(mods) {
  const memo = new Map(); // src → link[]
  return (path, src) => {
    let r = memo.get(src);
    if (r === undefined) {
      r = mods.link.linkFromsOfItems(mods.parse.parseFile(path, src, 0).ast.items).map((imp) => ({
        from: String(imp.from),
        re: String(imp.re),
        ns: String(imp.ns ?? ""),
        span: { start: imp.span.start, end: imp.span.end },
        names: [...imp.names].map((n) => ({ name: String(n.name), orig: String(n.orig), span: { start: n.span.start, end: n.span.end } })),
      }));
      memo.set(src, r);
    }
    return r;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// s478 (ruled-stdlib-data) — PER-NAME supply of a barrel module. RULED (user-voice-scrml.md,
// "⭐ RULED — open owner questions, PA recs adopted wholesale (S478, 2026-11-17)", item 55):
// "Q1: per-name supply of a barrel module. RULED: yes, INTERIM — it unblocks the modules whose
// other names compile." The rec (docs/known-gaps.md g-boot-stdlib-data-owner-questions-s478):
// "compile only the re-export targets a program reaches, and refuse a failing name by name (rather
// than failing the whole import)".
//
// A stdlib file's NAMED re-export (`export { a, b } from "./x.scrml"`, §21.4) is followed only when
// something that reaches the file needs one of the names it exports — a project file's
// `import { a } from "scrml:M"`, or a stdlib file's. A re-export no one needs is left out of the
// compile: its statement is blanked in the supplied text (same length, newlines kept, so every span
// still points into the file on disk) and its target file is not supplied. Everything else is
// followed as before: an `import` (its target needs the names it binds), an `export *`, and every
// statement of a file needed WHOLE (a namespace import `import * as m`, or `export * from "scrml:M"`).
//
// A reached re-export TARGET that does not compile on the bootstrap is WITHDRAWN alone (a module's
// entry file failing still withdraws the module — the s471 rule), and its re-export blanked: each
// name a program imports through it is then refused BY NAME at that import (E-BOOTSTRAP-UNSUPPORTED,
// `withheldRefusals`), never silently missing and never the misleading "not exported" E-IMPORT-004 the
// analyzer reports for a name its module no longer exports. A file that IMPORTS a withdrawn file
// fails on the next round (its import resolves to nothing) and is withdrawn in turn — so a failure
// climbs to the module only through import edges, never through a re-export.
// ─────────────────────────────────────────────────────────────────────────────

const NEED_ALL = "*";

// The names one linking statement needs of its target: every name for a namespace import and an
// `export *`; else the names it binds, as the TARGET exports them (`orig`).
function namesNeeded(l) {
  if (l.ns !== "" || l.re === "ReexportAll") return NEED_ALL;
  return new Set(l.names.map((n) => n.orig));
}

// The names of a named re-export `l` that a file needing `need` reaches (the names it exports, `name`).
function reachedNames(l, need) {
  if (need === NEED_ALL) return l.names;
  return l.names.filter((n) => need.has(n.name));
}

// `src` with each of `spans` replaced by spaces (newlines kept): same length, same lines.
function blank(src, spans) {
  if (spans.length === 0) return src;
  let out = "";
  let at = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    out += src.slice(at, s.start) + src.slice(s.start, s.end).replace(/[^\n]/g, " ");
    at = s.end;
  }
  return out + src.slice(at);
}

/**
 * The stdlib sources a source set imports, transitively, as front-end inputs:
 * `{ sources: [{ path, src, abs }], modules: Map<name, Set<path>> }` — `path` the
 * prefixed project path the compiler sees, `abs` the file on disk (for a driver's
 * diagnostics), and per imported module the set of stdlib paths its closure
 * reaches. A module named in `exclude`, the deferred `scrml:compiler` family, a
 * name that is not a stdlib name, or a module with no file under `root` is not
 * supplied — so its import resolves to nothing and analyze refuses it by name.
 * s478 (ruled-stdlib-data): a NAMED re-export is followed only for the names something needs
 * (the per-name barrel supply, above); `opts.withdrawn` the stdlib files withdrawn one by one
 * (path → their Error diagnostics), never supplied. Also returns `entries` (module → its entry
 * file) and `withheld` — `[{ module, file, name, target, diags }]`: each name a needed re-export of
 * `file` exports from the withdrawn `target`.
 */
export function stdlibSources(mods, files, opts = {}) {
  const root = opts.stdlibRoot ?? STDLIB_ROOT;
  const exclude = opts.exclude ?? new Set();
  // s478 (ruled-stdlib-data): stdlib FILES withdrawn one by one (a re-export target that failed)
  const withdrawn = opts.withdrawn ?? new Map(); // stdlib path → its Error diagnostics
  const prefix = mods.link.stdlibPrefix();
  const byPath = new Map(); // stdlib path → { path, src, abs } (src as supplied: unneeded re-exports blanked)
  const modules = new Map(); // module name → Set<stdlib path>
  // s473 (#1658 review F2): `opts.importFroms` — a driver's own memoised reader of a file's import
  // specifiers (scripts/scrml-boot.ts importReader), so a file the driver already parsed to follow
  // its imports is not parsed again here. Default: the bootstrap parser, as below. s478: its `.links`
  // (lowered.js importFroms) read the statements in full; a reader without them gets its own.
  const fromsOf = opts.importFroms ?? importFroms(mods);
  const linksOf = typeof fromsOf.links === "function" ? fromsOf.links : importLinks(mods);
  // the stdlib file a linking statement of `path` names — a module name per `scrml:` specifier (its
  // entry file), a relative one inside the prefix (`module` null: the importer's own module) — or null
  const targetOf = (path, from) => {
    if (from.startsWith(prefix)) {
      const name = from.slice(prefix.length);
      if (!STDLIB_NAME.test(name) || deferredStdlib(name) || exclude.has(name)) return null;
      const rel = stdlibFile(root, `${name}/index.scrml`) ? `${name}/index.scrml` : stdlibFile(root, `${name}.scrml`) ? `${name}.scrml` : null;
      return rel !== null ? { module: name, path: prefix + rel } : null;
    }
    if (path.startsWith(prefix) && (from.startsWith("./") || from.startsWith("../"))) {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const p = String(mods.link.resolveFrom(dir, from));
      if (p.startsWith(prefix) && stdlibFile(root, p.slice(prefix.length))) return { module: null, path: p };
    }
    return null;
  };
  const read = (p) => {
    let entry = byPath.get(p);
    if (entry === undefined) {
      const abs = join(root, ...p.slice(prefix.length).split("/"));
      entry = { path: p, src: readFileSync(abs, "utf8"), abs };
      byPath.set(p, entry);
    }
    return entry;
  };
  const need = new Map(); // stdlib path → Set<exported name> | NEED_ALL
  const todo = [];
  // `p` (of `module`) must export `names` too; a file whose need grew is read again
  const want = (module, p, names) => {
    const seen = modules.get(module) ?? new Set();
    modules.set(module, seen);
    seen.add(p);
    const cur = need.get(p);
    let grew = false;
    if (cur === undefined) {
      need.set(p, names === NEED_ALL ? NEED_ALL : new Set(names));
      grew = true;
    } else if (cur !== NEED_ALL) {
      if (names === NEED_ALL) {
        need.set(p, NEED_ALL);
        grew = true;
      } else {
        for (const n of names) if (!cur.has(n)) { cur.add(n); grew = true; }
      }
    }
    if (grew) todo.push([module, p]);
  };
  // the statements of `p` that are followed: every one but a named re-export no one needs, or one
  // of a withdrawn file
  const followed = (p, l, t) => {
    if (t === null) return true;
    if (l.re !== "Reexport") return !withdrawn.has(t.path);
    return reachedNames(l, need.get(p) ?? NEED_ALL).length > 0 && !withdrawn.has(t.path);
  };
  const direct = new Set(); // the modules a project file itself imports
  const entries = new Map(); // module → its entry file
  for (const f of files) {
    for (const l of linksOf(f.path, f.src)) {
      const t = targetOf(f.path, l.from);
      if (t === null || t.module === null) continue;
      direct.add(t.module);
      entries.set(t.module, t.path);
      want(t.module, t.path, namesNeeded(l));
    }
  }
  while (todo.length > 0) {
    const [module, p] = todo.pop();
    const entry = read(p);
    for (const l of linksOf(entry.path, entry.src)) {
      const t = targetOf(p, l.from);
      if (t === null || !followed(p, l, t)) continue;
      // a relative statement is this module's own file; a `scrml:` one is another module, judged on
      // its own — withdrawn, its import here is refused in THIS module's file, which withdraws this one
      if (t.module !== null) entries.set(t.module, t.path);
      // a followed named re-export is supplied VERBATIM — every name it lists — so its target must
      // export all of them, not only the reached ones: else a barrel re-exporting a barrel would
      // re-export a name its (blanked) target no longer exports, and the module fail whole
      // (s478 #1948 review MED-1). A leaf target is supplied whole anyway; per-name holds there.
      const names = namesNeeded(l);
      want(t.module ?? module, t.path, names);
    }
  }
  // the supplied texts: a stdlib file's re-exports that are not followed, blanked; the names a
  // program needs of a withdrawn target, withheld
  const withheld = []; // [{ module, file, name, target, diags }]
  for (const [module, paths] of modules) {
    for (const p of paths) {
      const entry = byPath.get(p);
      const spans = [];
      for (const l of linksOf(entry.path, entry.src)) {
        if (l.re !== "Reexport") continue;
        const t = targetOf(p, l.from);
        if (t === null || followed(p, l, t)) continue;
        spans.push(l.span);
        if (withdrawn.has(t.path)) {
          for (const n of reachedNames(l, need.get(p))) withheld.push({ module, file: p, name: n.name, target: t.path, diags: withdrawn.get(t.path) });
        }
      }
      if (spans.length > 0) byPath.set(p, { ...entry, src: blank(entry.src, spans) });
    }
  }
  return { sources: [...byPath.values()], modules, direct, entries, withheld };
}

/**
 * s478 (ruled-stdlib-data, S478 open-Qs ruling item 55) — the refusals of withheld names, BY NAME at
 * the import: for each project file's `import { n } from "scrml:M"` (or `export { n } from
 * "scrml:M"`) whose name `n` the stdlib driver withheld, the analyzer's E-IMPORT-004 at that name
 * (the supplied module no longer exports it) is replaced by an E-BOOTSTRAP-UNSUPPORTED saying why;
 * a statement that needs the WHOLE module (`import * as m`, `export *`) of a module with a withheld
 * name is refused at the statement, since the name it would reach is not there. Nothing else changes.
 */
function withheldRefusals(mods, files, std, diags, linksOf) {
  if (std.withheld.length === 0) return diags;
  const prefix = mods.link.stdlibPrefix();
  const key = (file, name) => file + "\u0000" + name;
  const byName = new Map(std.withheld.map((w) => [key(w.file, w.name), w]));
  const why = (w) => {
    const first = w.diags[0];
    const n = w.diags.length;
    return `its source \`${w.target}\` does not compile on the bootstrap yet (${n} error${n === 1 ? "" : "s"}; the first: [${first?.code}] ${String(first?.message ?? "").slice(0, 200)}) — the bootstrap supplies a stdlib module's names one by one, so the module's other names are imported (INTERIM per-name supply, S478 open-Qs ruling (user-voice) item 55)`;
  };
  const relabel = new Map(); // file \0 start \0 end → the refusal message
  const added = [];
  for (const f of files) {
    for (const l of linksOf(f.path, f.src)) {
      if (!l.from.startsWith(prefix)) continue;
      const entry = std.entries.get(l.from.slice(prefix.length));
      if (entry === undefined) continue;
      if (namesNeeded(l) === NEED_ALL) {
        const ws = std.withheld.filter((w) => w.file === entry);
        if (ws.length > 0) {
          added.push({ code: "E-BOOTSTRAP-UNSUPPORTED", severity: "Error", file: f.path, span: l.span, message: `\`${l.from}\` is reached whole here, and the bootstrap withholds its name${ws.length === 1 ? "" : "s"} ${ws.map((w) => "`" + w.name + "`").join(", ")}: ${why(ws[0])}. Import the names you use by name (\`import { … } from "${l.from}"\`)` });
        }
        continue;
      }
      for (const n of l.names) {
        const w = byName.get(key(entry, n.orig));
        if (w !== undefined) relabel.set(`${f.path}\u0000${n.span.start}\u0000${n.span.end}`, `\`${n.orig}\` cannot be imported from \`${l.from}\` on the bootstrap: ${why(w)}`);
      }
    }
  }
  const out = diags.map((d) => {
    if (d.code !== "E-IMPORT-004" || !d.span) return d;
    const m = relabel.get(`${d.file}\u0000${d.span.start}\u0000${d.span.end}`);
    return m === undefined ? d : { ...d, code: "E-BOOTSTRAP-UNSUPPORTED", severity: "Error", message: m };
  });
  return out.concat(added);
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
 * s478 (ruled-stdlib-data, S478 open-Qs ruling item 55, INTERIM): a failing file that is not its
 * module's entry is withdrawn alone, and a name a program imports through it is refused BY NAME at
 * that import (`withheldRefusals`); `stdlib.withheld` lists them (`stdlibSources`).
 */
export function frontEndStdlib(mods, files, entry, opts = {}) {
  const prefix = mods.link.stdlibPrefix();
  // s472 (review F2): a project file named under the prefix is a named refusal (frontEnd), not a throw
  const named = prefixedProjectFiles(mods, files, new Set());
  if (named.length > 0) return { ...refusedFrontEnd(named), stdlib: { supplied: [], sources: [], refused: [], withheld: [] } };
  const exclude = new Set(opts.exclude ?? []);
  const refused = [];
  // s478 (ruled-stdlib-data): the stdlib files withdrawn one by one — path → its Error diagnostics
  const withdrawn = new Map();
  const withdrawnOf = new Map(); // withdrawn path → the module it was withdrawn from
  const withdrawnSrc = new Map(); // withdrawn path → its source entry ({ path, src, abs }), as last supplied
  // one reader for every round (a withdrawn module re-runs the search over the same texts)
  const readFroms = opts.importFroms ?? importFroms(mods);
  const linksOf = typeof readFroms.links === "function" ? readFroms.links : importLinks(mods);
  const byName = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  for (;;) {
    const std = stdlibSources(mods, files, { stdlibRoot: opts.stdlibRoot, exclude, withdrawn, importFroms: readFroms });
    const r = frontEnd(mods, [...files, ...std.sources.map((s) => ({ path: s.path, src: s.src }))], entry, { stdlibPaths: std.sources.map((s) => s.path), keyBase: opts.keyBase, routeBase: opts.routeBase });
    const badFiles = new Map(); // stdlib file → its Error diagnostics
    for (const d of r.diags) {
      if (!isError(d) || !String(d.file ?? "").startsWith(prefix)) continue;
      badFiles.set(d.file, [...(badFiles.get(d.file) ?? []), d]);
    }
    if (badFiles.size === 0) {
      const mine = (d) => !String(d.file ?? "").startsWith(prefix);
      return {
        ...r,
        diags: withheldRefusals(mods, files, std, r.diags.filter(mine), linksOf),
        parseDiags: r.parseDiags.filter(mine),
        infos: (r.infos ?? []).filter(mine),
        stdlib: {
          supplied: [...std.modules].map(([module, paths]) => ({ module, files: [...paths].sort() })),
          sources: std.sources,
          refused,
          withheld: std.withheld,
        },
      };
    }
    // s478 (ruled-stdlib-data): a failing file that is not a module's entry is withdrawn ALONE (its
    // names a re-export reaches are then withheld by name; a file importing it fails next round). A
    // failing ENTRY withdraws its module — with every module whose closure holds it (s471) — and
    // reports first the files of it withdrawn before (the cause its entry's failure follows from).
    const entryFiles = new Set(std.entries.values());
    const bad = new Map(); // module → its Error diagnostics
    for (const [file, ds] of [...badFiles].sort(byName)) {
      if (!entryFiles.has(file)) {
        withdrawn.set(file, ds);
        const se = std.sources.find((x) => x.path === file);
        if (se !== undefined) withdrawnSrc.set(file, se);
        for (const [m, paths] of std.modules) if (paths.has(file) && !withdrawnOf.has(file)) withdrawnOf.set(file, m);
        continue;
      }
      for (const [m, paths] of std.modules) {
        if (paths.has(file)) bad.set(m, [...(bad.get(m) ?? []), ...ds]);
      }
    }
    for (const [m, ds] of [...bad].sort(byName)) {
      exclude.add(m);
      let cause = [];
      for (const [file, owner] of withdrawnOf) if (owner === m) cause = cause.concat(withdrawn.get(file));
      let shown = std.sources.filter((s) => std.modules.get(m)?.has(s.path));
      for (const [file, owner] of withdrawnOf) if (owner === m && withdrawnSrc.has(file)) shown = shown.concat([withdrawnSrc.get(file)]);
      refused.push({ module: m, direct: std.direct.has(m), diags: cause.concat(ds), sources: shown });
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
