// colon-return-s477.test.js — s477-boot-colon-return-reject.
//
// bryan S477 (user-voice-scrml.md §S477 "⭐ RULED — tool main return type spelled ->"): a
// return type is written `->`; `): T` is newly rejected. SPEC §7: "`->` is the sole
// return-type annotation syntax for `function` and `fn` declarations."
//
// A `:` after a function's parameter list is E-PARSE-FN whose message names `-> T`, in every
// spacing (`): T`, `) : T`, `):T`, a newline before the colon) and for every function head the
// bootstrap reads (`function`, `fn`, `server function`, `export function`, a failable `!`). The
// written type is read, never dropped, and the body parses: ONE diagnostic, no cascade. A
// `<host>` binding line's `: T` result is E-HOST-BINDING-MALFORMED naming `-> T`.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const diags = (src) => run(src).diags.filter((d) => d.severity !== "warning" && !String(d.code).startsWith("W-"));

const prog = (head) =>
  `<program>\n    ${head} {\n        return x + 1;\n    }\n    <main>\n        <p>\${f(1)}</p>\n    </main>\n</program>\n`;

const SPELLINGS = [
  ["unspaced `): T`", "(x: int): int"],
  ["spaced `) : T`", "(x: int) : int"],
  ["tight `):T`", "(x: int):int"],
  ["newline before the colon", "(x: int)\n        : int"],
  ["newline after the colon", "(x: int) :\n        int"],
  ["a union type `) : int | not`", "(x: int) : int | not"],
];
const HEADS = [
  ["function", "function f"],
  ["fn", "fn f"],
  ["export function", "export function f"],
];

describe("a `:`-spelled return type is E-PARSE-FN naming `->` (§7)", () => {
  for (const [hn, h] of HEADS) {
    for (const [sn, s] of SPELLINGS) {
      test(`${hn} — ${sn}`, () => {
        const ds = diags(prog(h + s));
        expect(ds.map((d) => d.code)).toEqual(["E-PARSE-FN"]);
        expect(ds[0].message).toContain("-> T");
        expect(ds[0].message).toContain("§7");
      });
    }
  }

  test("the written type is kept as the declared return (never dropped)", () => {
    const r = run(prog("function f(x: int) : int"));
    const fns = [];
    const walk = (n) => {
      if (n && typeof n === "object") {
        if (n.name === "f" && "ret" in n && "params" in n) fns.push(n);
        for (const v of Object.values(n)) walk(v);
      }
    };
    walk(r.files ?? r.asts ?? r);
    expect(fns.length).toBeGreaterThan(0);
    expect(fns[0].ret).not.toBe(undefined);
    expect(fns[0].ret).not.toBe(null);
    expect(JSON.stringify(fns[0].ret)).toContain("int");
  });

  test("a `server function` head (deprecated modifier) — `) : T`", () => {
    const src = `<program>\n    server function f(x: int) : int {\n        return x + 1;\n    }\n    <main><p>hi</p></main>\n</program>\n`;
    const ds = diags(src);
    expect(ds.map((d) => d.code)).toEqual(["E-PARSE-FN"]);
    expect(ds[0].message).toContain("-> T");
  });

  test("a file-level logic block `${ … }` — `) : T`", () => {
    const src = `<program>\n\${\n    function f(x: int) : int {\n        return x + 1;\n    }\n}\n    <main><p>\${f(1)}</p></main>\n</program>\n`;
    const ds = diags(src);
    expect(ds.map((d) => d.code)).toEqual(["E-PARSE-FN"]);
  });

  test("a failable function: `)! : E` is E-PARSE-FN naming `->` (§19.4.1)", () => {
    const src = `<program>\n    type LoadError:enum = { Timeout }\n    function f(x: int)! : LoadError {\n        fail .Timeout;\n    }\n    <main><p>hi</p></main>\n</program>\n`;
    const ds = diags(src);
    expect(ds.map((d) => d.code)).toEqual(["E-PARSE-FN"]);
    expect(ds[0].message).toContain("->");
  });
});

describe("positive controls — `->` is accepted", () => {
  for (const [hn, h] of HEADS) {
    test(`${hn} (x: int) -> int`, () => {
      expect(diags(prog(h + "(x: int) -> int")).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    });
  }
  test("no return annotation", () => {
    expect(diags(prog("function f(x: int)")).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  });
  test("a failable `)! -> E` and `)! E`", () => {
    const src = `<program>\n    type LoadError:enum = { Timeout }\n    function a()! -> LoadError {\n        fail .Timeout;\n    }\n    function b()! LoadError {\n        fail .Timeout;\n    }\n    <main><p>hi</p></main>\n</program>\n`;
    expect(diags(src).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  });
});

describe("a `<host>` binding line", () => {
  test("`name(p) : T = target` is E-HOST-BINDING-MALFORMED naming `-> T`", () => {
    const src = `<program>\n    <host>\n        now() : number = Date.now\n    </host>\n    <main><p>hi</p></main>\n</program>\n`;
    const ds = diags(src).filter((d) => d.code === "E-HOST-BINDING-MALFORMED");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("-> T");
  });
});
