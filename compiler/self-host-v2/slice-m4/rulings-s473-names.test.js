// rulings-s473-{names,trap,lint}.test.js (one file per ruling) — s473-boot-rulings-names-trap-lint: three S473 owner rulings
// (user-voice-scrml.md "⭐ RULED — S473 PA recs, all", item 4):
//
//   "Same-name components across files, and `<card>` beside `fn card`: REFUSED."
//   "A write past the end of a tape position: runtime TRAP."
//   "A write to a loop copy that changes nothing: W- lint."
//
//   1. NAMES — §7.6: a file-scope name is bound ONCE in its file, whatever it
//      names (a `let` / `const`, a `function`, a `type`, a user declaration):
//      E-SCOPE-010 (g-boot-decl-fn-same-name-one-file-s472). §9.1 DQ-7 / §21:
//      two COMPONENTS of one name in one program, in any two files, are
//      E-COMPONENT-NAME-DUPLICATE (g-boot-component-scope-key-bare-name-s472).
//   2. TRAP — §66.12.6 rule 3: a write to a tape position at or past its end
//      (any position write: `@xs[i] = v`, `@xs[i].f = v`, a local's `xs[i] = v`)
//      is the E-INDEX-OUT-OF-RANGE-RT trap and nothing is written
//      (g-spec-index-write-past-end-enforcement-s472).
//   3. LINT — §66.10: a part write to a `for … of` binder (a COPY) that no later
//      read of the binder observes is W-LOOP-COPY-WRITE-UNREAD
//      (g-loop-copy-part-write-no-op-s472).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const two = (lib, app) =>
  frontEnd(mods, [{ path: "a.scrml", src: lib }, { path: "app.scrml", src: app }], "app.scrml").diags.map((d) => [d.code, d.file]);
const P = (decls, main = `        <p>x</p>`) => `<program>\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
const CARD = `    <card t:string/>\n    renders <div>\${t}</div>`;
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};

// ---------------------------------------------------------------------------
describe("1a — one file-scope name, one binding: E-SCOPE-010 across kinds (§7.6, S473)", () => {
  test("a user declaration `<card>` and a function `card`", () => {
    const r = run(P(`${CARD}\n    function card() -> int { return 1; }`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-SCOPE-010"]);
    expect(r.diags[0].message).toContain("§7.6");
  });
  test("a type and a function of one name", () => {
    expect(codes(P(`    type T:enum = { A, B }\n    function T() -> int { return 1; }`))).toEqual(["E-SCOPE-010"]);
  });
  test("a type and a user declaration of one name", () => {
    expect(codes(P(`    type card:enum = { A, B }\n${CARD}`))).toEqual(["E-SCOPE-010"]);
  });
  test("two user declarations of one name in one file", () => {
    expect(codes(P(`${CARD}\n    <card u:string/>\n    renders <div>\${u}</div>`))).toEqual(["E-SCOPE-010"]);
  });
  test("two types of one name in one file", () => {
    expect(codes(P(`    type T:struct = { a: int }\n    type T:struct = { b: string }`))).toEqual(["E-SCOPE-010"]);
  });
  test("a constant beside a type, or a user declaration, of its name", () => {
    expect(codes(P(`    \${ const T = 1; }\n    type T:enum = { A, B }`))).toEqual(["E-SCOPE-010"]);
    expect(codes(P(`    \${ const card = 1; }\n${CARD}`))).toEqual(["E-SCOPE-010"]);
  });
  test("one report per later binding, naming the first", () => {
    const src = P(`    type card:enum = { A, B }\n${CARD}\n    function card() -> int { return 1; }`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-SCOPE-010", "E-SCOPE-010"]);
    // each report sits at a binding after the first (`type card` itself is never the one reported)
    for (const d of r.diags) expect(d.span.start).toBeGreaterThan(src.indexOf("type card"));
  });
  // s473 review LOW-1: a constant is one more binding — never reported when it comes FIRST,
  // and never twice in a three-way clash
  test("a constant first, then a type and a function of its name: one report at each LATER binding", () => {
    const src = P(`    \${ const X = 1; }\n    type X:enum = { A, B }\n    function X() -> int { return 1; }`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-SCOPE-010", "E-SCOPE-010"]);
    const at = r.diags.map((d) => d.span.start).sort((a, b) => a - b);
    expect(at[0]).toBe(src.indexOf("type X"));
    expect(at[1]).toBe(src.indexOf("function X"));
    for (const x of r.diags) expect(x.message).toContain("the constant `X`");
  });
  test("a type first, then a constant of its name: the report is at the constant", () => {
    const src = P(`    type X:enum = { A, B }\n    \${ const X = 1; }`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-SCOPE-010"]);
    expect(r.diags[0].span.start).toBeGreaterThan(src.indexOf("type X"));
  });
  test("distinct names stay silent; a different case is a different name", () => {
    expect(codes(P(`${CARD}\n    function cardOf() -> int { return 1; }`))).toEqual([]);
    expect(codes(P(`    type Card:enum = { A, B }\n${CARD}`))).toEqual([]);
  });
  // s473 r2 #5 ("One name per program for every user declaration"): was silent (two files, two scopes)
  test("a function in ANOTHER file named like a declaration here: E-SCOPE-010 (one name per program)", () => {
    expect(two(`export function card() -> int { return 1; }\n`, P(`    <card x:string/>\n    renders <p>\${x}</p>`))).toEqual([["E-SCOPE-010", "app.scrml"]]);
  });
});

describe("1b — two components of one name in one program: E-COMPONENT-NAME-DUPLICATE (§9.1, §21, S473)", () => {
  test("in two files: refused by the language rule, at the second declaration", () => {
    const ds = two(`export <card t:string/>\nrenders <div>\${t}</div>\n`, P(`    <card x:string/>\n    renders <p>\${x}</p>`));
    expect(ds).toEqual([["E-COMPONENT-NAME-DUPLICATE", "app.scrml"]]);
  });
  test("the message names the other file and the scope key", () => {
    const r = frontEnd(mods, [
      { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` },
      { path: "app.scrml", src: P(`    <card x:string/>\n    renders <p>\${x}</p>`) },
    ], "app.scrml");
    expect(r.diags[0].message).toContain("a.scrml");
    expect(r.diags[0].message).toContain("data-scrml");
  });
  // s473 r2 #5: was E-BOOTSTRAP-UNSUPPORTED (unruled); now ruled — one name per program
  test("two same-named declarations that are NOT both components: E-SCOPE-010 (one name per program)", () => {
    expect(two(`export <card t:string/>\n`, P(`    <card x:string/>\n    renders <p>\${x}</p>`))).toEqual([["E-SCOPE-010", "app.scrml"]]);
  });
  test("fails closed: no runnable Core is trusted — the code is an Error (§34)", () => {
    expect(mods.severity.severityOf("E-COMPONENT-NAME-DUPLICATE")).toBe("Error");
  });
});
