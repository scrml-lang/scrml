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
 * These pin both directions for both forms, the per-file scoping (a path-cited symbol must be in
 * THAT file), and the "a comment / a string is not code" discipline on both languages.
 *
 * A gate that has never failed is indistinguishable from one that cannot (pa-base §8): every
 * "resolves" case below has a twin that must NOT resolve.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  stripJsForIdents, stripScrmlForIdents, identsOfSource, extractCitations, staleReasons,
} from "../../../scripts/s34-provenance.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ids = (src, path) => identsOfSource(src, path);

describe("scrml identifiers — executable text only", () => {
  test("a fn definition is an identifier; a name only in a // or /* */ comment is not", () => {
    const s = ids(`\${\n  // oldName was renamed\n  /* also oldName */\n  fn newName(x: int) -> int { return x }\n}\n`, "a.scrml");
    expect(s.has("newName")).toBe(true);
    expect(s.has("oldName")).toBe(false);
  });

  test("a name only inside a \"…\" display-text / string literal is not an identifier", () => {
    const s = ids(`\${ fn f() { return "call ghostFn here" } }`, "a.scrml");
    expect(s.has("f")).toBe(true);
    expect(s.has("ghostFn")).toBe(false);
  });

  test("a multi-line display-text literal is blanked whole; code after it is kept", () => {
    const s = ids(`\${ let t = "line one ghostA\nline two ghostB"\n fn after() {} }`, "a.scrml");
    expect(s.has("ghostA")).toBe(false);
    expect(s.has("ghostB")).toBe(false);
    expect(s.has("after")).toBe(true);
  });

  test("a <!-- --> markup comment is not code", () => {
    const s = ids(`<!-- ghostHtml -->\n<program>\n  function real() {}\n</program>\n`, "a.scrml");
    expect(s.has("ghostHtml")).toBe(false);
    expect(s.has("real")).toBe(true);
  });

  test("a stray apostrophe in free text is contained to its line", () => {
    const s = ids(`<p>don't panic</p>\nexport function stillSeen() {}\n`, "a.scrml");
    expect(s.has("stillSeen")).toBe(true);
  });

  test("every surface: ${ } block, <program> body, item-position file scope", () => {
    expect(ids(`\${ fn inBlock() {} }`, "a.scrml").has("inBlock")).toBe(true);
    expect(ids(`<program>\n function inProgram() {}\n</program>`, "a.scrml").has("inProgram")).toBe(true);
    expect(ids(`export function atFileScope() { @m = 1 }`, "a.scrml").has("atFileScope")).toBe(true);
  });

  test("the real bootstrap: analyze.scrml defines resolveSlot", () => {
    const p = join(ROOT, "compiler/self-host-v2/analyze.scrml");
    expect(ids(readFileSync(p, "utf8"), p).has("resolveSlot")).toBe(true);
  });

  test("offsets and line count are preserved", () => {
    const src = `\${\n // c\n let a = "x"\n}\n`;
    const out = stripScrmlForIdents(src);
    expect(out.length).toBe(src.length);
    expect(out.split("\n").length).toBe(src.split("\n").length);
  });
});

describe("JS/TS identifiers — comments and '…'/\"…\" contents are not code", () => {
  test("a name only in a comment or a quoted string does not count (it did, for strings, before S474)", () => {
    const s = ids(`// ghostC\nconst msg = "ghostD failed"; const m2 = 'ghostE';\nexport function live() {}\n`, "a.ts");
    for (const g of ["ghostC", "ghostD", "ghostE"]) expect(s.has(g)).toBe(false);
    expect(s.has("live")).toBe(true);
  });

  test("template-literal text is kept (emitted code), and its ${} code too", () => {
    const s = ids("const rt = `function _scrml_helper() { return ${inner} }`;", "a.js");
    expect(s.has("_scrml_helper")).toBe(true);
    expect(s.has("inner")).toBe(true);
  });

  test("a regex literal holding a backtick or quote does not swallow the code after it", () => {
    // the measured case: protect-egress.ts foldIdent's /…"…`…/ hid a later export
    const s = ids("const m = /(\"x\"|`[^`]*`)$/.exec(s);\nexport function afterRegex() {}\n", "a.ts");
    expect(s.has("afterRegex")).toBe(true);
  });

  test("division is not a regex", () => {
    const s = ids("const q = a / b; const r = c / d;\nfunction afterDiv() {}\n", "a.ts");
    expect(s.has("afterDiv")).toBe(true);
    expect(s.has("c")).toBe(true);
  });

  test("offsets and line count are preserved", () => {
    const src = "// c\nconst a = 'x' + `t${b}`; /* k */\n";
    const out = stripJsForIdents(src);
    expect(out.length).toBe(src.length);
    expect(out.split("\n").length).toBe(src.split("\n").length);
  });

  test("a non-source file has no identifier set", () => {
    expect(identsOfSource("anything", "README.md")).toBeNull();
  });
});

describe("citation extraction — the forms §34 uses", () => {
  test("`path` `sym` and `path` (`sym`, …) both carry the path; via/in are tree-wide", () => {
    const row = "| E-X | §1 | t. Emitted at `compiler/src/a.ts:12` `alpha`; bootstrap `compiler/self-host-v2/b.scrml` (`beta`, via `parse.scrml` `gamma`); via `delta`; in the `epsilon` pass. | Error |";
    const c = extractCitations(row);
    expect(c).toContainEqual({ sym: "alpha", path: "compiler/src/a.ts", form: "path-sym" });
    expect(c).toContainEqual({ sym: "beta", path: "compiler/self-host-v2/b.scrml", form: "path-paren" });
    expect(c).toContainEqual({ sym: "delta", path: null, form: "via" });
    expect(c).toContainEqual({ sym: "epsilon", path: null, form: "in" });
    // only the FIRST name in the parenthesis belongs to the path
    expect(c.find((x) => x.sym === "gamma")).toBeUndefined();
  });

  test("lowercase_snake prose (a SQL catalog) is not a symbol", () => {
    expect(extractCitations("| E-X | reads in `pg_constraint` |")).toEqual([]);
  });
});

describe("resolution on the REAL tree — the bite, both forms", () => {
  const ctx = { root: ROOT, treeIdents: new Set() }; // path-scoped citations never consult it
  const A = "compiler/self-host-v2/analyze.scrml";

  test("a correct bootstrap citation resolves — path-sym form (FAILED before S474)", () => {
    expect(staleReasons(`| E-X | §1 | t (emitted at \`${A}\` \`resolveSlot\`). | Error |`, ctx)).toEqual([]);
  });

  test("a correct bootstrap citation resolves — path-paren form", () => {
    expect(staleReasons(`| E-X | §1 | t (emitted at \`${A}\` (\`resolveSlot\`)). | Error |`, ctx)).toEqual([]);
  });

  test("a renamed bootstrap symbol FAILS — path-sym form", () => {
    const r = staleReasons(`| E-X | §1 | t (emitted at \`${A}\` \`resolveSlotRenamed\`). | Error |`, ctx);
    expect(r.length).toBe(1);
    expect(r[0]).toContain("resolveSlotRenamed");
    expect(r[0]).toContain(A);
  });

  test("a renamed bootstrap symbol FAILS — path-paren form (PASSED SILENTLY before S474)", () => {
    const r = staleReasons(`| E-X | §1 | t (emitted at \`${A}\` (\`resolveSlotRenamed\`)). | Error |`, ctx);
    expect(r.length).toBe(1);
    expect(r[0]).toContain("resolveSlotRenamed");
  });

  test("per-file scoping: a symbol that exists in the tree but NOT in the cited file fails", () => {
    // findAuthoredResponseConstruction is real (compiler/src/codegen/protect-egress.ts), not the bootstrap's
    const r = staleReasons(`| E-X | §1 | t (\`${A}\` \`findAuthoredResponseConstruction\`). | Error |`,
      { root: ROOT, treeIdents: new Set(["findAuthoredResponseConstruction"]) });
    expect(r.length).toBe(1);
    const ok = staleReasons("| E-X | §1 | t (`compiler/src/codegen/protect-egress.ts` `findAuthoredResponseConstruction`). | Error |", ctx);
    expect(ok).toEqual([]);
  });

  test("a missing path is reported once, not again as a missing symbol", () => {
    const r = staleReasons("| E-X | §1 | t (`compiler/self-host-v2/gone.scrml` (`x`)). | Error |", ctx);
    expect(r).toEqual(["names `compiler/self-host-v2/gone.scrml`, which does not exist"]);
  });

  test("tree-wide forms consult the tree identifier set", () => {
    expect(staleReasons("| E-X | §1 | t via `known`. |", { root: ROOT, treeIdents: new Set(["known"]) })).toEqual([]);
    expect(staleReasons("| E-X | §1 | t via `unknown`. |", { root: ROOT, treeIdents: new Set() }).length).toBe(1);
  });
});

describe("resolution on a fixture tree — comment-only and string-only names do not launder", () => {
  let root;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "s34-prov-"));
    mkdirSync(join(root, "compiler/self-host-v2"), { recursive: true });
    mkdirSync(join(root, "compiler/src/dir"), { recursive: true });
    writeFileSync(join(root, "compiler/self-host-v2/m.scrml"),
      `\${\n  // eulogy: oldFn was here\n  fn newFn() -> string { return "oldStr mentioned" }\n}\n`);
    writeFileSync(join(root, "compiler/src/dir/a.ts"), "export function inDir() {}\n");
    writeFileSync(join(root, "compiler/src/dir/notes.md"), "mdOnly\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const row = (cite) => `| E-X | §1 | t (${cite}). | Error |`;
  test("defined symbol resolves; comment-only and string-only names fail (both forms)", () => {
    const ctx = { root, treeIdents: new Set() };
    expect(staleReasons(row("`compiler/self-host-v2/m.scrml` `newFn`"), ctx)).toEqual([]);
    expect(staleReasons(row("`compiler/self-host-v2/m.scrml` (`newFn`)"), ctx)).toEqual([]);
    for (const g of ["oldFn", "oldStr"]) {
      expect(staleReasons(row(`\`compiler/self-host-v2/m.scrml\` \`${g}\``), ctx).length).toBe(1);
      expect(staleReasons(row(`\`compiler/self-host-v2/m.scrml\` (\`${g}\`)`), ctx).length).toBe(1);
    }
  });

  test("a directory path scopes to the source files under it", () => {
    const ctx = { root, treeIdents: new Set() };
    expect(staleReasons(row("`compiler/src/dir/` `inDir`"), ctx)).toEqual([]);
    expect(staleReasons(row("`compiler/src/dir/` `mdOnly`"), ctx).length).toBe(1);
  });

  test("a non-source file cannot vouch for a symbol: it falls back to tree-wide", () => {
    expect(staleReasons(row("`compiler/src/dir/notes.md` `x`"), { root, treeIdents: new Set(["x"]) })).toEqual([]);
    expect(staleReasons(row("`compiler/src/dir/notes.md` `x`"), { root, treeIdents: new Set() }).length).toBe(1);
  });
});
