/**
 * s34-census-provenance-s474.test.js — the §34.0 provenance resolver checks BOOTSTRAP symbols.
 *
 * WHY THIS EXISTS (g-s34-census-symbol-check-ignores-scrml-s474). `scripts/s34-census.ts
 * --check-new` (CI) requires a new/changed §34 row's provenance to RESOLVE. Its resolver collected
 * identifiers from .ts/.js/.mjs only and did not parse the bootstrap's parenthesized citation form
 * `path` (`sym`), so:
 *   - a CORRECT row naming a bootstrap function (`…/analyze.scrml` `resolveSlot`) failed, and
 *   - the workaround form (`…/analyze.scrml` (`resolveSlot`)) passed without being checked at all
 *     — a renamed bootstrap function passed silently.
 * These pin both directions for every citation form, per-file scoping (a path-cited symbol must be
 * in THAT file), bare-filename resolution, the test-tree exclusion, and — the S474 review's F1 —
 * that NO definition anywhere in the scanned trees is invisible to the resolver.
 *
 * A gate that has never failed is indistinguishable from one that cannot (pa-base §8): every
 * "resolves" case below has a twin that must NOT resolve.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  stripJsForIdents, stripScrmlForIdents, identsOfSource, extractCitations, staleReasons,
  isTestPath, buildTreeIdents, SCAN_ROOTS, SOURCE_EXT,
} from "../../../scripts/s34-provenance.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ids = (src, path) => identsOfSource(src, path);
const row = (cite) => `| E-X | §1 | t (emitted at ${cite}). | Error |`;

describe("identifiers — a comment is not code; literals are (they are emitted code)", () => {
  test("scrml: a name only in a // or /* */ or <!-- --> comment is not an identifier", () => {
    const s = ids(`<!-- ghostHtml -->\n\${\n  // oldName was renamed\n  /* also oldName */\n  fn newName(x: int) -> int { return x }\n}\n`, "a.scrml");
    expect(s.has("newName")).toBe(true);
    expect(s.has("oldName")).toBe(false);
    expect(s.has("ghostHtml")).toBe(false);
  });

  test("scrml: a // inside a string is not a comment, and a quote inside a comment opens nothing", () => {
    const s = ids(`\${ let u = "http://x" ; fn kept() {} }\n// it's a comment\nfn alsoKept() {}\n`, "a.scrml");
    expect(s.has("kept")).toBe(true);
    expect(s.has("alsoKept")).toBe(true);
  });

  test("scrml: every surface — ${ } block, <program> body, item-position file scope", () => {
    expect(ids(`\${ fn inBlock() {} }`, "a.scrml").has("inBlock")).toBe(true);
    expect(ids(`<program>\n function inProgram() {}\n</program>`, "a.scrml").has("inProgram")).toBe(true);
    expect(ids(`export function atFileScope() { @m = 1 }`, "a.scrml").has("atFileScope")).toBe(true);
  });

  test("JS: comments are not code; string, template and regex text IS (F1: emitted helpers)", () => {
    const s = ids(`// ghostC\nconst lines = ["function _scrml_quoted(p) {", 'x'];\nconst t = \`function _scrml_tmpl() { \${inner} }\`;\n`, "a.ts");
    expect(s.has("ghostC")).toBe(false);
    for (const k of ["_scrml_quoted", "_scrml_tmpl", "inner"]) expect(s.has(k)).toBe(true);
  });

  test("JS: a regex literal holding a quote or backtick does not hide the comment after it", () => {
    const s = ids("const m = /(\"x\"|`[^`]*`)$/.exec(s); // ghostAfterRegex\nexport function afterRegex() {}\n", "a.ts");
    expect(s.has("afterRegex")).toBe(true);
    expect(s.has("ghostAfterRegex")).toBe(false);
  });

  test("offsets and line count are preserved (both strippers)", () => {
    const js = "// c\nconst a = 'x' + `t${b}`; /* k */\n";
    expect(stripJsForIdents(js).length).toBe(js.length);
    expect(stripJsForIdents(js).split("\n").length).toBe(js.split("\n").length);
    const sc = `\${\n // c\n let a = "x"\n}\n<!-- m -->\n`;
    expect(stripScrmlForIdents(sc).length).toBe(sc.length);
    expect(stripScrmlForIdents(sc).split("\n").length).toBe(sc.split("\n").length);
  });

  test("a non-source file has no identifier set", () => {
    expect(identsOfSource("anything", "README.md")).toBeNull();
  });
});

describe("citation extraction — the forms §34 uses", () => {
  test("`path` `sym`, `path` (`sym`, …), bare filenames, via/in", () => {
    const r = "| E-X | §1 | t. Emitted at `compiler/src/a.ts:12` `alpha`; bootstrap `compiler/self-host-v2/b.scrml` (`beta`, via `parse.scrml` `gamma`); via `delta`; in the `epsilon` pass. | Error |";
    const c = extractCitations(r).map(({ sym, path, bare, form }) => ({ sym, path, bare, form }));
    expect(c).toContainEqual({ sym: "alpha", path: "compiler/src/a.ts", bare: undefined, form: "path-sym" });
    expect(c).toContainEqual({ sym: "beta", path: "compiler/self-host-v2/b.scrml", bare: undefined, form: "path-paren" });
    expect(c).toContainEqual({ sym: "gamma", path: null, bare: "parse.scrml", form: "bare-sym" });
    expect(c).toContainEqual({ sym: "delta", path: null, bare: undefined, form: "via" });
    expect(c).toContainEqual({ sym: "epsilon", path: null, bare: undefined, form: "in" });
    // gamma belongs to parse.scrml, not to b.scrml (the list stops at `via`)
    expect(c.find((x) => x.sym === "gamma" && x.path === "compiler/self-host-v2/b.scrml")).toBeUndefined();
  });

  test("Q3: a parenthesis LIST — joined by , / + and — belongs to the path, up to the first prose word", () => {
    const c = extractCitations("| E-X | t (`compiler/x.scrml` (`a`, `b` / `c` + `d` and `e`, called from `f`)). |");
    expect(c.filter((x) => x.path === "compiler/x.scrml").map((x) => x.sym)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("lowercase_snake prose (a SQL catalog) is not a symbol", () => {
    expect(extractCitations("| E-X | reads in `pg_constraint` |")).toEqual([]);
  });
});

describe("resolution on the REAL tree — the bite, every form", () => {
  const A = "compiler/self-host-v2/analyze.scrml";
  let ctx;
  beforeAll(() => { ctx = { root: ROOT, treeIdents: buildTreeIdents(ROOT) }; });

  test("a correct bootstrap citation resolves — path-sym (FAILED before S474) and path-paren", () => {
    expect(staleReasons(row(`\`${A}\` \`resolveSlot\``), ctx)).toEqual([]);
    expect(staleReasons(row(`\`${A}\` (\`resolveSlot\`)`), ctx)).toEqual([]);
    expect(staleReasons(row(`\`${A}\` (\`resolveSlot\`, \`resolveElem\`)`), ctx)).toEqual([]);
  });

  test("a renamed bootstrap symbol FAILS — path-sym and path-paren (the latter PASSED SILENTLY before S474)", () => {
    for (const cite of [`\`${A}\` \`resolveSlotRenamed\``, `\`${A}\` (\`resolveSlotRenamed\`)`]) {
      const r = staleReasons(row(cite), ctx);
      expect(r.length).toBe(1);
      expect(r[0]).toContain("resolveSlotRenamed");
      expect(r[0]).toContain(A);
    }
  });

  test("Q3: a bogus name later in the parenthesis list FAILS — the (real, bogus) hole", () => {
    const r = staleReasons(row(`\`${A}\` (\`resolveSlot\`, \`resolveSlotBogus\`)`), ctx);
    expect(r.length).toBe(1);
    expect(r[0]).toContain("resolveSlotBogus");
  });

  test("F1: a helper defined only on a QUOTED-STRING line resolves in all three forms", () => {
    const P = "compiler/src/codegen/sqlite-file-target.ts"; // `"function _scrml_sqlite_path(dbPath) {",`
    expect(staleReasons(row(`\`${P}\` \`_scrml_sqlite_path\``), ctx)).toEqual([]);
    expect(staleReasons(row(`\`${P}\` (\`_scrml_sqlite_path\`)`), ctx)).toEqual([]);
    expect(staleReasons(row("via `_scrml_sqlite_path`"), ctx)).toEqual([]);
  });

  test("per-file scoping: a real symbol cited in the WRONG file fails", () => {
    const r = staleReasons(row(`\`${A}\` \`findAuthoredResponseConstruction\``), ctx);
    expect(r.length).toBe(1);
    expect(staleReasons(row("`compiler/src/codegen/protect-egress.ts` `findAuthoredResponseConstruction`"), ctx)).toEqual([]);
  });

  test("bare filename: the sibling of the row's last full path wins over a repo-wide ambiguity", () => {
    // parse.scrml is ambiguous repo-wide; the sibling rule picks compiler/self-host-v2/parse.scrml
    expect(staleReasons(row("`compiler/self-host-v2/css-syntax.scrml` (`parseCssBlock`, via `parse.scrml` `parseCssNode`)"), ctx)).toEqual([]);
    expect(staleReasons(row("`compiler/self-host-v2/css-syntax.scrml` (`parseCssBlock`, via `parse.scrml` `parseCssNodeRenamed`)"), ctx).length).toBe(1);
  });

  test("F4: a symbol cited in a NON-source path (a script, a doc, a directory) fails — cite the source file", () => {
    for (const p of ["scripts/assemble-spec.sh", "compiler/SPEC.md", "compiler/self-host-v2/"]) {
      const r = staleReasons(row(`\`${p}\` \`resolveSlot\``), ctx);
      expect(r.length).toBe(1);
      expect(r[0]).toContain("cite the source file");
    }
  });

  test("a missing path is reported once, not again as a missing symbol", () => {
    expect(staleReasons(row("`compiler/self-host-v2/gone.scrml` (`x`)"), ctx))
      .toEqual(["names `compiler/self-host-v2/gone.scrml`, which does not exist"]);
  });

  test("F2: test trees never vouch for a tree-wide name — this file's fake names do not resolve", () => {
    // these names are spelled in THIS test's string literals (a test tree) and nowhere in non-test code
    for (const fake of ["resolveSlotRenamed", "resolveSlotBogus", "ghostFn", "oldName"]) {
      expect(ctx.treeIdents.has(fake)).toBe(false);
      expect(staleReasons(row(`via \`${fake}\``), ctx).length).toBe(1);
    }
    expect(ctx.treeIdents.has("resolveSlot")).toBe(true);
    expect(isTestPath("compiler/tests/unit/x.test.js")).toBe(true);
    expect(isTestPath("compiler/self-host-v2/slice-m4/gate.test.js")).toBe(true);
    expect(isTestPath("compiler/self-host-v2/acceptance/arms/x/case.scrml")).toBe(true);
    expect(isTestPath("compiler/self-host-v2/analyze.scrml")).toBe(false);
  });
});

describe("F1 — every definition in the scanned trees is visible to the resolver", () => {
  // INDEPENDENT oracle (not the resolver's stripper): `function X` / `fn X` / `class X` anywhere in a
  // source file — code, string or template — minus block comments and line comments found naively.
  // The oracle can only UNDER-count (a naive cut removes extra text), so a miss below is a real
  // definition the resolver cannot see: a correct row citing it would fail.
  function walk(d, o = []) {
    let es; try { es = readdirSync(d); } catch { return o; }
    for (const e of es) {
      if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
      const p = join(d, e); const st = statSync(p);
      if (st.isDirectory()) walk(p, o); else if (SOURCE_EXT.test(p)) o.push(p);
    }
    return o;
  }
  function oracleDefs(src) {
    const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
    const out = [];
    for (const line of noBlock.split("\n")) {
      // cut at the first `//` not inside a quote counted naively on this line
      let q = null, cut = line.length;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === "`") { q = c; continue; }
        if (c === "/" && line[i + 1] === "/") { cut = i; break; }
      }
      for (const m of line.slice(0, cut).matchAll(/\b(?:function\*?|fn|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) out.push(m[1]);
    }
    return out;
  }

  test("a path-sym row for EVERY definition resolves", () => {
    const ctx = { root: ROOT, treeIdents: new Set() };
    let defs = 0;
    const misses = [];
    for (const r of SCAN_ROOTS) for (const f of walk(join(ROOT, r))) {
      const rel = relative(ROOT, f).replace(/\\/g, "/");
      for (const sym of new Set(oracleDefs(readFileSync(f, "utf8")))) {
        defs++;
        if (staleReasons(row(`\`${rel}\` \`${sym}\``), ctx).length) misses.push(`${rel} ${sym}`);
      }
    }
    expect(defs).toBeGreaterThan(10000);
    expect(misses).toEqual([]);
  }, 60000);
});

describe("bare-filename resolution on a fixture tree", () => {
  let root;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "s34-prov-"));
    for (const d of ["compiler/src/a", "compiler/src/b", "compiler/self-host-v2", "compiler/tests/unit"]) mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, "compiler/src/a/dup.ts"), "export function inA() {}\n");
    writeFileSync(join(root, "compiler/src/b/dup.ts"), "export function inB() {}\n");
    writeFileSync(join(root, "compiler/src/a/only.ts"), "export function onlyFn() {}\n");
    writeFileSync(join(root, "compiler/self-host-v2/m.scrml"), "${ fn newFn() {} }\n");
    writeFileSync(join(root, "compiler/tests/unit/testonly.ts"), "export function inTest() {}\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("unique repo match resolves; the symbol is checked in that file", () => {
    const ctx = { root, treeIdents: new Set() };
    expect(staleReasons(row("`only.ts` `onlyFn`"), ctx)).toEqual([]);
    expect(staleReasons(row("`only.ts` `missingFn`"), ctx).length).toBe(1);
  });

  test("an ambiguous name resolves only via the sibling of the row's last full path", () => {
    const ctx = { root, treeIdents: new Set() };
    expect(staleReasons(row("`compiler/src/b/x.ts` and `dup.ts` `inB`"), ctx)).toEqual(["names `compiler/src/b/x.ts`, which does not exist"]);
    expect(staleReasons(row("`compiler/src/a/only.ts` `onlyFn`, `dup.ts` `inA`"), ctx)).toEqual([]);
    const amb = staleReasons(row("`dup.ts` `inA`"), ctx);
    expect(amb.length).toBe(1);
    expect(amb[0]).toContain("ambiguous");
    expect(amb[0]).toContain("give the full path");
  });

  test("no match — and a test-tree file is never a bare-name match — fails: give the full path", () => {
    const ctx = { root, treeIdents: new Set() };
    expect(staleReasons(row("`nowhere.ts` `x`"), ctx)[0]).toContain("matches no non-test source file");
    expect(staleReasons(row("`testonly.ts` `inTest`"), ctx)[0]).toContain("matches no non-test source file");
  });
});
