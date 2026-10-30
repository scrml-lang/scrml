// host-src.js — s473-host-allowlist-a (lane A, design host-binding-allowlist-design-2026-10-29.md §10
// step 1): DRAFT SPEC §21.3.3 rule 3 for `<host src="./file.js">` in the bootstrap — the STATIC export
// read, the §21.3 copy closure, and the files the client artifact imports.
//
// Rule 3 (verbatim): "The exports of a `src=` file SHALL be determined by parsing its ES module export
// declarations (`export function` / `class` / `const` / `let` / `var`, `export { … }`, `export default`,
// and `export … from` / `export * from` followed through the §21.3 copy closure). The compiler SHALL NOT
// load, import, or evaluate a `src=` file, or any file it reaches, at build time. … A name that the file
// does not export, or that it reaches only through a form the parse cannot resolve, SHALL be
// `E-IMPORT-004`." And: "The path is resolved with symlinks followed, and then checked as §21.3 checks a
// client helper: a file that does not exist is `E-IMPORT-006`; a file that resolves outside the project
// root, or whose `_scrml_local/` copy path falls in a §47.13 denied class, is `E-IMPORT-011`. The file is
// copied exactly as a §21.3 client import is."
//
// THE PROVEN PATH (memory: constrain to proven path). The read is acorn's parse — the same parser and
// the same walk impl#1's §21.3 copy closure uses (compiler/src/api.js helperModuleSpecifiers): a parse
// builds a tree and runs nothing. The denied-class test is impl#1's ONE definition
// (compiler/src/static-serve-policy-emitted.js `_scrml_static_denied`), imported, never copied. The copy
// layout is impl#1's (`<outputDir>/_scrml_local/<path relative to the project root>`, mirrored so every
// helper-to-helper relative specifier stays valid).
//
// What the compiler hands this file: each `<host src=>` binding's Core HostBind carries `src`, a HostSrc
// (core.scrml): `path` (the `src=` value resolved against the declaring file's directory, relative to the
// build's source root — analyze.scrml hostSrcOfBind), `file` / `at` (where the binding was declared, for
// diagnostics) and `targetless` (no `= target`: the call is of the export of the binding's own name);
// and `root`, the export the binding's call is rooted at. The printer imports src module K (K = first-appearance order over
// `core.fns`, print.scrml hostSrcs) as `./_scrml/host-src/K.js`; this file writes that shim, which
// re-exports the copy: `export * from "../../_scrml_local/<rel>";`.
//
// Every diagnostic is an Error; any one means the build writes nothing (the drivers stop).

import { parse as acornParse } from "acorn";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { _scrml_static_denied } from "../../src/static-serve-policy-emitted.js";

export const HOST_LOCAL_DIR = "_scrml_local";
const HELPER_EXT_RE = /\.(?:js|mjs)$/;
const posix = (p) => p.split(sep).join("/");

/** The project root of a build whose source root is `sourceRoot` (§21.3): the nearest ancestor holding `scrml.toml` or `.git`, else the source root. */
export function projectRootOf(sourceRoot) {
  let d = resolve(sourceRoot);
  for (;;) {
    if (existsSync(join(d, "scrml.toml")) || existsSync(join(d, ".git"))) return d;
    const up = dirname(d);
    if (up === d) return resolve(sourceRoot);
    d = up;
  }
}

/** acorn's module parse, or null when the text is not an ES module. Never evaluated. */
function parseModule(code) {
  try {
    return { program: acornParse(code, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }), err: "" };
  } catch (e) {
    return { program: null, err: String(e && e.message ? e.message : e) };
  }
}

/** The names a binding pattern binds (`export const { a, b: [c] } = …`). */
function patternNames(p, out) {
  if (!p) return out;
  switch (p.type) {
    case "Identifier": out.push(p.name); break;
    case "ObjectPattern": for (const q of p.properties) patternNames(q.type === "RestElement" ? q.argument : q.value, out); break;
    case "ArrayPattern": for (const q of p.elements) patternNames(q, out); break;
    case "RestElement": patternNames(p.argument, out); break;
    case "AssignmentPattern": patternNames(p.left, out); break;
    default: break;
  }
  return out;
}

const nameOf = (n) => (n.type === "Identifier" ? n.name : String(n.value));

/** Every relative `.js` / `.mjs` specifier a module names (imports, re-exports, literal dynamic imports) — impl#1's helperModuleSpecifiers walk. */
function relativeSpecifiers(program) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if ((node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration")
      && node.source && typeof node.source.value === "string") {
      out.push(node.source.value);
    } else if (node.type === "ImportExpression" && node.source && node.source.type === "Literal" && typeof node.source.value === "string") {
      out.push(node.source.value);
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") visit(c); }
      else if (v && typeof v.type === "string") visit(v);
    }
  };
  visit(program);
  return out.filter((s) => (s.startsWith("./") || s.startsWith("../")) && HELPER_EXT_RE.test(s));
}

/**
 * One build's reader: plans each file (realpath, the project-root and denied-class checks, the copy
 * path) once, and reads each file's exports once. `fail(code, message)` records a diagnostic.
 */
function makeReader(projectRoot, fail) {
  let realRoot;
  try { realRoot = realpathSync.native(projectRoot); } catch { realRoot = resolve(projectRoot); }
  const planned = new Map(); // abs -> { real, rel } | null
  const copies = new Map(); // out -> real
  const exportsMemo = new Map(); // real -> Exports

  /** Plan the copy of `abs` and (transitively) its relative imports; returns { real, rel } or null. */
  const plan = (abs, via) => {
    if (planned.has(abs)) return planned.get(abs);
    planned.set(abs, null);
    const shown = posix(abs);
    const by = via ? ` (imported by \`${posix(via)}\`)` : "";
    let real;
    try {
      real = realpathSync.native(abs);
      if (!statSync(real).isFile()) throw new Error("not a file");
    } catch {
      fail("E-IMPORT-006", `\`${shown}\`${by} does not exist — a \`<host src=>\` file, and every file it imports, is copied into the build output for the browser to load (§21.3.3 rule 3, §21.3)`);
      return null;
    }
    const rel = relative(realRoot, real);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      fail("E-IMPORT-011", `\`${shown}\`${by} resolves outside the project root \`${posix(realRoot)}\` (symlinks followed) — the compiler copies a \`<host src=>\` file and its imports into the build output and will not copy a file from outside the project (§21.3.3 rule 3, §21.3); move it inside the project, or mark the intended root with \`scrml.toml\``);
      return null;
    }
    const out = `${HOST_LOCAL_DIR}/${posix(rel)}`;
    if (_scrml_static_denied(out)) {
      fail("E-IMPORT-011", `\`${shown}\`${by} has a copy path (\`${out}\`) in a class the server never serves (§47.13: \`*.server.*\`, databases, dot-paths, \`.scrml\`, \`.map\`) — it is not copied (§21.3.3 rule 3, §21.3); rename or move it`);
      return null;
    }
    const p = { real, rel: posix(rel), out };
    planned.set(abs, p);
    copies.set(out, real);
    let code = null;
    try { code = readFileSync(real, "utf8"); } catch { code = null; }
    const parsed = code === null ? { program: null } : parseModule(code);
    if (parsed.program !== null) {
      for (const s of relativeSpecifiers(parsed.program)) plan(resolve(dirname(real), s), real);
    }
    return p;
  };

  /**
   * The exports of the planned file `real`: { names: Map<name, origin>, unresolved: string[] (the forms the
   * parse cannot resolve), broken: string[] (re-exports that name nothing), err: "" | parse error }.
   * `origin` identifies the binding a name resolves to, so two `export *` of DIFFERENT bindings under one
   * name make it ambiguous — which ES excludes — rather than exported.
   */
  const exportsOf = (real, stack = []) => {
    if (exportsMemo.has(real)) return exportsMemo.get(real);
    const empty = { names: new Map(), unresolved: [], broken: [], err: "", cuts: new Set() };
    // a star cycle adds nothing new HERE — but the caller's result is then PARTIAL until `real` (still on
    // the stack) completes, so it carries the cut and is not memoized (#1670 review L3: a partial result
    // memoized for the cycle partner gave a false E-IMPORT-004 that depended on binding order)
    if (stack.includes(real)) return { ...empty, cuts: new Set([real]) };
    let code;
    try { code = readFileSync(real, "utf8"); } catch (e) { return { ...empty, err: "it cannot be read" }; }
    const parsed = parseModule(code);
    if (parsed.program === null) {
      const r = { ...empty, err: "it does not parse as an ES module (" + parsed.err + ")" };
      exportsMemo.set(real, r);
      return r;
    }
    const names = new Map();
    const unresolved = [];
    const broken = [];
    const starNames = new Map(); // name -> origin | "\0ambiguous"
    const cuts = new Set(); // cycle cuts below this file that point at a file still on the stack above it
    const absorb = (te) => { for (const c of te.cuts) if (c !== real) cuts.add(c); };
    const sourceOf = (spec) => {
      if (!((spec.startsWith("./") || spec.startsWith("../")) && HELPER_EXT_RE.test(spec))) return null;
      const p = plan(resolve(dirname(real), spec), real);
      return p === null ? null : p.real;
    };
    for (const node of parsed.program.body) {
      if (node.type === "ExportDefaultDeclaration") {
        names.set("default", real + "#default");
      } else if (node.type === "ExportNamedDeclaration") {
        if (node.declaration) {
          const d = node.declaration;
          if (d.type === "VariableDeclaration") {
            for (const dc of d.declarations) for (const n of patternNames(dc.id, [])) names.set(n, real + "#" + n);
          } else if (d.id) {
            names.set(d.id.name, real + "#" + d.id.name);
          }
        } else if (!node.source) {
          for (const sp of node.specifiers) names.set(nameOf(sp.exported), real + "#" + nameOf(sp.local));
        } else {
          const spec = String(node.source.value);
          const target = sourceOf(spec);
          if (target === null) {
            for (const sp of node.specifiers) unresolved.push("`export { " + nameOf(sp.local) + " } from \"" + spec + "\"`");
            continue;
          }
          const te = exportsOf(target, stack.concat([real]));
          absorb(te);
          for (const sp of node.specifiers) {
            const local = nameOf(sp.local);
            if (te.names.has(local)) names.set(nameOf(sp.exported), te.names.get(local));
            else broken.push("`export { " + local + " } from \"" + spec + "\"` (`" + spec + "` does not export `" + local + "`)");
          }
        }
      } else if (node.type === "ExportAllDeclaration") {
        const spec = String(node.source.value);
        const target = sourceOf(spec);
        if (target === null) {
          unresolved.push("`export * " + (node.exported ? "as " + nameOf(node.exported) + " " : "") + "from \"" + spec + "\"`");
          continue;
        }
        if (node.exported) {
          names.set(nameOf(node.exported), target + "#*");
          continue;
        }
        const te = exportsOf(target, stack.concat([real]));
        absorb(te);
        for (const [n, origin] of te.names) {
          if (n === "default") continue;
          const had = starNames.get(n);
          if (had === undefined) starNames.set(n, origin);
          else if (had !== origin) starNames.set(n, "\0ambiguous");
        }
        unresolved.push(...te.unresolved);
      }
    }
    for (const [n, origin] of starNames) {
      if (names.has(n) || origin === "\0ambiguous") continue; // a local export shadows a star; an ambiguous one is excluded
      names.set(n, origin);
    }
    const r = { names, unresolved, broken, err: "", cuts };
    if (cuts.size === 0) exportsMemo.set(real, r); // computed under an open cycle: partial, not memoized
    return r;
  };

  return { plan, exportsOf, copies };
}

/**
 * The plan for one checked Core: `sourceRoot` is the absolute directory the compiled files' paths are
 * relative to; `projectRoot` defaults to projectRootOf(sourceRoot). Returns
 *   { diags: [{ code, message, file?, at? }], copies: [{ src, out }], shims: [{ out, text }] }
 * `file` is the declaring `.scrml` file (relative to the source root), `at` the binding's offset.
 */
export function planHostSrcs(core, sourceRoot, projectRoot = projectRootOf(sourceRoot)) {
  const diags = [];
  const srcs = []; // src keys in first-appearance order (print.scrml hostSrcs)
  const uses = new Map(); // src -> [{ name, file, at, bare }]
  for (const f of core.fns ?? []) {
    const b = f.host && f.host.bind;
    const hs = b ? b.src : null;
    if (!hs || typeof hs.path !== "string" || hs.path === "") continue;
    if (!uses.has(hs.path)) { uses.set(hs.path, []); srcs.push(hs.path); }
    uses.get(hs.path).push({ name: String(b.root), file: hs.file, at: hs.at, bare: hs.targetless === true });
  }
  const copies = [];
  const shims = [];
  if (srcs.length === 0) return { diags, copies, shims };
  let ctxFile;
  let ctxAt;
  const fail = (code, message) => diags.push({ code, message, file: ctxFile, at: ctxAt });
  const reader = makeReader(projectRoot, fail);
  srcs.forEach((src, k) => {
    const us = uses.get(src);
    ctxFile = us[0].file;
    ctxAt = us[0].at;
    const p = reader.plan(resolve(sourceRoot, src), null);
    if (p === null) return;
    const ex = reader.exportsOf(p.real);
    for (const b of ex.broken) fail("E-IMPORT-004", "`" + src + "` re-exports a name its source does not export: " + b + " — the browser would refuse to link the module, so no binding of it can run (§21.3.3 rule 3)");
    for (const u of us) {
      ctxFile = u.file;
      ctxAt = u.at;
      if (ex.err !== "") {
        fail("E-IMPORT-004", "`" + u.name + "` cannot be read from `" + src + "`: " + ex.err + " — a `<host src=>` file's exports are read by parsing its ES module export declarations (§21.3.3 rule 3)");
      } else if (!ex.names.has(u.name) || u.name === "default") {
        const why = ex.unresolved.length > 0
          ? " (it may reach it only through a form the parse cannot resolve: " + [...new Set(ex.unresolved)].join(", ") + ")"
          : "";
        const how = u.bare
          ? "a binding without a target calls the export of its own name"
          : "a target's root is a parameter, an export of `src`, or `window` / `document` / `navigator` (§21.3.3 rule 4)";
        fail(u.bare ? "E-IMPORT-004" : "E-HOST-TARGET-UNBOUND", "`" + u.name + "` is not exported by `" + src + "`" + why + " — " + how + " (§21.3.3 rule 3: exports are read statically, never by loading the file)");
      }
    }
    // #1670 review L1: the specifier is percent-encoded segment by segment (a real name `%2e%2e`, `#` or
    // `?` stays a literal name in the URL) and written as a JSON string literal (a `"` or a newline cannot
    // end it); no path is written into the comment
    const spec = "../../" + p.out.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    shims.push({ out: `_scrml/host-src/${k}.js`, text: "// a <host src=> module (§21.3.3 rule 3), re-exported from its copy (written by the compiler)\nexport * from " + JSON.stringify(spec) + ";\n" });
  });
  for (const [out, src] of reader.copies) copies.push({ src, out });
  copies.sort((a, b) => (a.out < b.out ? -1 : a.out > b.out ? 1 : 0));
  return { diags, copies, shims };
}
