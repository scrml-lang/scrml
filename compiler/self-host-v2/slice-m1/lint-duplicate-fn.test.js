// lint-duplicate-fn.test.js — g-impl1-bootstrap-duplicate-fn-last-wins-s473: proves the
// duplicate-function lint BITES, and that the real bootstrap tree is clean.
//
// impl#1 builds the bootstrap with no error for two top-level `fn`s of one name in one file (every
// call binds to the LAST one) or for a local `fn` named like an import (every call binds to the
// import). scripts/lint-duplicate-fn.js is the check (impl#1 is frozen for semantics, S471). Each
// bootstrap file is its own module scope; another file's names enter only by `import`, so the
// namespace a name can collide in is one file's functions + its imports.

import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintText, lintTree, topLevelNames, bootstrapFiles } from "../../../scripts/lint-duplicate-fn.js";
import { buildBundleChunks } from "./harness.js";

const TREE = join(import.meta.dir, "..");

const scratches = [];
afterEach(() => { for (const d of scratches.splice(0)) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "lint-duplicate-fn-")); scratches.push(d); return d; };

const mod = (body) => "${\n" + body + "\n}\n";

describe("lint-duplicate-fn — the real tree", () => {
  test("the bootstrap sources (compiler/self-host-v2) have no duplicate top-level function", () => {
    const r = lintTree(TREE);
    expect(r.files.length).toBeGreaterThanOrEqual(25);
    expect(r.violations).toEqual([]);
  });
  test("the scope is the bootstrap's own sources: top level, slice entries, their imports — not test inputs", () => {
    const rel = bootstrapFiles(TREE).map((f) => f.slice(TREE.length + 1));
    for (const f of ["analyze.scrml", "parse.scrml", "slice-m2/bundle.scrml", "slice-m3/css-bundle.scrml", "slice-m1/counter.core.scrml"]) expect(rel).toContain(f);
    expect(rel.some((f) => f.startsWith("acceptance/") || f.includes("/src/"))).toBe(false);
  });
});

describe("lint-duplicate-fn — what it flags", () => {
  test("two top-level `fn`s of one name: one violation, at the second", () => {
    const src = mod("    fn a(x: int) -> int { return 1 }\n    fn b() -> int { return a(0) }\n    fn a(x: int) -> int { return 2 }");
    const r = lintText(src);
    expect(r.violations.length).toBe(1);
    expect(r.violations[0].line).toBe(4);
    expect(r.violations[0].message).toContain("duplicate top-level function `a` (first at line 2)");
  });
  test("`fn` and `function`, `export` or not, count as one namespace", () => {
    expect(lintText(mod("    export fn a() {}\n    function a() {}")).violations.length).toBe(1);
  });
  test("a local function named like an import is flagged (impl#1 binds the calls to the import)", () => {
    const r = lintText(mod("    import { a, b as c } from \"./x.scrml\"\n    fn c() {}\n    fn b() {}"));
    expect(r.violations.map((v) => v.line)).toEqual([3]);
    expect(r.violations[0].message).toContain("name of an import");
  });
  test("one name imported twice is flagged", () => {
    const r = lintText(mod("    import { a } from \"./x.scrml\"\n    import {\n        a } from \"./y.scrml\""));
    expect(r.violations.length).toBe(1);
    expect(r.violations[0].message).toContain("imported twice");
  });
  test("not flagged: distinct names; a name inside a string or comment; a parameter or local named like a function", () => {
    expect(lintText(mod("    fn a() {}\n    fn b() {}")).violations).toEqual([]);
    expect(lintText(mod("    fn a() { const s = \"fn a() {}\"\n return s }\n    // fn a() {}\n    /* fn a() {} */")).violations).toEqual([]);
    expect(lintText(mod("    fn a(b: int) -> int { const a = b\n return a }\n    fn b() {}")).violations).toEqual([]);
  });
  test("a function body is skipped whole (a return type with braces in it, nested braces)", () => {
    const n = topLevelNames(mod("    fn a(x: int) -> FieldInfo | not { if (x > 1) { return { a: 1 } } return not }\n    fn b() { match x { .A :> { } } }"));
    expect(n.fns.map((f) => f.name)).toEqual(["a", "b"]);
  });
});

describe("lint-duplicate-fn — bite on a scratch tree", () => {
  test("RED on a duplicate in a top-level file and in a file a slice entry imports; a test input is not linted", () => {
    const d = scratch();
    mkdirSync(join(d, "slice-x", "src"), { recursive: true });
    mkdirSync(join(d, "lib"), { recursive: true });
    writeFileSync(join(d, "top.scrml"), mod("    fn a() {}\n    fn a() {}"));
    writeFileSync(join(d, "lib", "linked.scrml"), mod("    export fn q() {}\n    fn q() {}"));
    writeFileSync(join(d, "slice-x", "bundle.scrml"), "<program>\n    import { q } from \"../lib/linked.scrml\"\n</program>\n");
    writeFileSync(join(d, "slice-x", "src", "case.scrml"), mod("    fn z() {}\n    fn z() {}"));
    const r = lintTree(d);
    expect(r.violations.map((v) => v.file.slice(d.length + 1)).sort()).toEqual(["lib/linked.scrml", "top.scrml"]);
    writeFileSync(join(d, "top.scrml"), mod("    fn a() {}\n    fn a2() {}"));
    writeFileSync(join(d, "lib", "linked.scrml"), mod("    export fn q() {}"));
    expect(lintTree(d).violations).toEqual([]);
  });
});

// s479-import-shadow — the lint covers SPEC §7.6's whole file-scope namespace ("A `let` / `const`, a
// `function`, a `type` and a user declaration … bound at file scope share one namespace"; "a file that
// imports a name and also declares it is E-SCOPE-010"), and the bootstrap BUILD runs it. Found when a
// lane exported `opensTag` from lex.scrml into parse.scrml, which had its own `opensTag`: impl#1 built
// the bundle, bound every call to the import, and bootstrap conformance fell 648 → 515 with nothing
// reported (the hook would have caught it at commit; the local build did not).
describe("s479-import-shadow — the §7.6 namespace", () => {
  test("an import colliding with a top-level `const` / `let` / `type`", () => {
    const r = lintText(mod("    import { K, L, T } from \"./x.scrml\"\n    const K = 1\n    let L = 2\n    type T:struct = { a: number }"));
    expect(r.violations.map((v) => v.line)).toEqual([3, 4, 5]);
    for (const v of r.violations) expect(v.message).toContain("E-SCOPE-010");
    expect(r.violations[2].message).toContain("`type T` has the name of an import");
  });
  test("an `as` alias collides by its LOCAL name, and `import * as ns` binds `ns`", () => {
    const r = lintText(mod("    import { g as f } from \"./x.scrml\"\n    import * as ns from \"./y.scrml\"\n    fn f() {}\n    const ns = 3\n    fn g() {}"));
    expect(r.violations.map((v) => v.line)).toEqual([4, 5]);
    expect(r.violations[1].message).toContain("from \"./y.scrml\"");
  });
  test("two local bindings of one name, of different kinds", () => {
    const r = lintText(mod("    type Sym:struct = { id: int }\n    fn Sym() -> int { return 1 }\n    const Sym = 2"));
    expect(r.violations.map((v) => v.line)).toEqual([3, 4]);
    expect(r.violations[0].message).toContain("first: `type Sym` at line 2");
  });
  test("not flagged: a struct field named `type`; a `const` inside a function; a `type` used as a field read", () => {
    expect(lintText(mod("    import { a } from \"./x.scrml\"\n    type T:struct = { type: string, b: int }\n    fn f(t: T) -> string { const a = t.type\n return a }")).violations).toEqual([]);
  });
  test("the incident, replayed on the real parse.scrml: importing lex.scrml's `opensTag` is flagged at the local", () => {
    const src = readFileSync(join(TREE, "parse.scrml"), "utf8");
    const old = "isKeyword } from \"./lex.scrml\"";
    const at = src.indexOf(old);
    expect(at).toBeGreaterThan(0);
    const replay = src.slice(0, at) + "isKeyword, opensTag } from \"./lex.scrml\"" + src.slice(at + old.length);
    const r = lintText(replay);
    expect(r.violations.length).toBe(1);
    expect(r.violations[0].message).toContain("top-level function `opensTag` has the name of an import");
  });
});

describe("s479-import-shadow — the bootstrap BUILD refuses a collision (buildBundleChunks)", () => {
  test("a bundle whose (transitively imported) module collides is refused before impl#1 runs; renamed, it builds", () => {
    const d = scratch();
    writeFileSync(join(d, "lib.scrml"), mod("    export fn f() -> string { return \"lib\" }"));
    writeFileSync(join(d, "mid.scrml"), mod("    import { f } from \"./lib.scrml\"\n    fn f() -> string { return \"local\" }\n    export fn useF() -> string { return f() }"));
    writeFileSync(join(d, "bundle.scrml"), "<program>\n    ${ import { useF } from \"./mid.scrml\" }\n    <p>${useF()}</p>\n</program>\n");
    let err = null;
    try { buildBundleChunks(join(d, "bundle.scrml"), []); } catch (e) { err = e; }
    expect(err).not.toBeNull();
    expect(String(err.message)).toContain("bootstrap bundle refused");
    expect(String(err.message)).toContain("E-SCOPE-010");
    expect(String(err.message)).toContain("mid.scrml:3:");
    expect(String(err.message)).toContain("`f` has the name of an import");
    // renamed: it builds
    writeFileSync(join(d, "mid.scrml"), mod("    import { f } from \"./lib.scrml\"\n    fn f2() -> string { return \"local\" }\n    export fn useF() -> string { return f() + f2() }"));
    const built = buildBundleChunks(join(d, "bundle.scrml"), []);
    expect(built.chunks.length).toBeGreaterThan(0);
  });
});
