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
describe("3 — a part write to a loop copy that nothing reads: W-LOOP-COPY-WRITE-UNREAD (§66.10, S473)", () => {
  const LETR = `    type R:struct = { let name: string }\n    <ps:R[]=([{ name: "a" }])/>\n    let <shown:string=""/>`;
  const FREER = `    type R:struct = { name: string }\n    <ps:R[]=([{ name: "a" }])/>\n    let <shown:string=""/>`;
  const fn = (decls, body) => P(`${decls}\n    function go() {\n${body}\n    }`);
  const lint = (src) => run(src).diags.filter((d) => d.code === "W-LOOP-COPY-WRITE-UNREAD");

  test("`for (let p of @ps) { p.name = … }` — the cell is unchanged: the lint, at the write", () => {
    const src = fn(FREER, `        for (let p of @ps) { p.name = "z"; }`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["W-LOOP-COPY-WRITE-UNREAD"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toContain("p.name");
    expect(r.diags[0].message).toContain("@ps");
  });
  test("the keywordless binder writing a `let` field: the lint", () => {
    expect(codes(fn(LETR, `        for (p of @ps) { p.name = "z"; }`))).toEqual(["W-LOOP-COPY-WRITE-UNREAD"]);
  });
  test("it is a Warning: the program still compiles (§34)", () => {
    expect(mods.severity.severityOf("W-LOOP-COPY-WRITE-UNREAD")).toBe("Warning");
    const r = run(fn(LETR, `        for (p of @ps) { p.name = "z"; }`));
    expect(r.core).toBeTruthy();
  });
  test("the write's own value reading the binder does not count — it is read BEFORE the write", () => {
    expect(codes(fn(LETR, `        for (p of @ps) { p.name = p.name + "!"; }`))).toEqual(["W-LOOP-COPY-WRITE-UNREAD"]);
  });
  test("a read only BEFORE the write: the lint", () => {
    expect(codes(fn(LETR, `        for (p of @ps) {\n            @shown = p.name;\n            p.name = "z";\n        }`))).toEqual(["W-LOOP-COPY-WRITE-UNREAD"]);
  });
  test("a read after the write observes it: silent", () => {
    expect(codes(fn(LETR, `        for (p of @ps) {\n            p.name = "z";\n            @shown = p.name;\n        }`))).toEqual([]);
  });
  test("a loop bound as a value that lifts the binder: silent", () => {
    expect(codes(fn(LETR, `        const qs = for (p of @ps) {\n            p.name = "z";\n            lift p;\n        };\n        for (q of qs) { @shown = q.name; }`))).toEqual([]);
  });
  test("the write inside an inner loop whose earlier statement reads the binder: silent (the next inner pass reads it)", () => {
    expect(codes(fn(LETR, `        for (p of @ps) {\n            for (i of 0..2) {\n                @shown = p.name;\n                p.name = "z";\n            }\n        }`))).toEqual([]);
  });
  test("a nested binder of the same name is a different binding: the outer write is still unread", () => {
    expect(lint(fn(LETR, `        for (p of @ps) {\n            p.name = "z";\n            for (p of @ps) { @shown = p.name; }\n        }`)).length).toBe(1);
  });
  test("a loop over a LOCAL tape: the same copy, the same lint", () => {
    expect(codes(fn(LETR, `        const qs: R[] = @ps;\n        for (p of qs) { p.name = "z"; }`))).toEqual(["W-LOOP-COPY-WRITE-UNREAD"]);
  });
  test("a part write of a plain local (not a loop binder) is not this lint", () => {
    expect(codes(fn(LETR, `        let q: R = { name: "a" };\n        q.name = "z";`))).toEqual([]);
  });
  test("a refused write gets its error only, never the lint as well", () => {
    expect(codes(fn(FREER, `        for (const p of @ps) { p.name = "z"; }`))).not.toContain("W-LOOP-COPY-WRITE-UNREAD");
  });
  test("markup lifted in the body reads the binder: silent", () => {
    const src = P(`${LETR}`, `        <ul>\${ for (p of @ps) {\n            p.name = "z";\n            lift <li>\${p.name}</li>;\n        } }</ul>`);
    expect(lint(src)).toEqual([]);
  });
  // s473 review LOW-2: a refused statement that READS the binder records no Name fact — the
  // lint must not then claim "nothing reads" beside the error
  test("a loop body that already holds an error gets the error only", () => {
    const src = fn(`${LETR}\n    <out:R[append]=([])/>`, `        for (p of @ps) {\n            p.name = "z";\n            @out = [...@out, p];\n        }`);
    const cs = codes(src);
    expect(cs.length).toBeGreaterThan(0);
    expect(cs).not.toContain("W-LOOP-COPY-WRITE-UNREAD");
  });
});
