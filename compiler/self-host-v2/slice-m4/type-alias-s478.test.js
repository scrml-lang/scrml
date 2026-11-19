// type-alias-s478.test.js — s478 (lane s478-boot-parser-smalls, triage cluster C8): the type alias
// `type Name = T` in the bootstrap.
//
// SPEC: §14.1.2 / §14.1.1 name "type-alias right-hand sides (`type A = Type`)" as a type-annotation
// locus; §34 E-TYPE-ARM-QUALIFIER-MISMATCH: "Both names are compared after type-alias resolution
// (`type A = E` is `E`)"; §40.8: "a `type` alias ends where its type expression ends (§7.5
// `type-expr` …)". It is not a `type … = { … }` declaration (§7.2.2 rule 2's closer-delimited
// item), so it takes `;` (§7.2.2 rule 1). §19.4.4.1: "A bare variant does not resolve through a type
// alias" and "Whether an alias of an enum is a legal `!` error type at all is OPEN" — not built
// here. Before s478 the bootstrap read `type Id = int` as a malformed `type Id:kind = …`
// (E-PARSE-EXPECTED ×2 + E-PARSE-TYPE).
//
// `type E : error = { … }` is not a kind (§14.2, ruling S479 item 1) — slice-m4/error-kind-dg-s479.test.js.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const $ = (sel) => document.querySelector(sel);

const L = (logic, markup = "<p>x</p>") => `\${\n${logic}\n}\n<program>\n    ${markup}\n</program>\n`;

describe("§14.1.2 — `type A = T` is T wherever it is written", () => {
  test("aliases of a primitive, a tape, an optional and an enum compile clean and run", async () => {
    const src = L(`    type Id = int;
    type Ids = Id[];
    type MaybeName = string | not;
    type Pointer:enum = { Sha(hash: string), None }
    type P = Pointer;
    fn twice(x: Id) -> Id {
        return x * 2;
    }
    fn first(xs: Ids) -> Id {
        return xs[0];
    }
    fn nm(n: MaybeName) -> string {
        if (n is given) { return n; }
        return "none";
    }
    fn tag(p: P) -> string {
        return match p {
            .Sha(h) :> h,
            .None :> "none",
        };
    }`, `let <out:Id=5/>\n    <p id="o">\${twice(21)} \${first([3, 4])} \${nm("a")} \${tag(Pointer.None)} \${@out}</p>`);
    const r = run(src);
    expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    expect(mods.check.checkCore(r.core)).toEqual([]);
    await loadProgram(r.core, "type-alias-s478");
    expect($("#o").textContent).toBe("42 3 a none 5");
  });

  test("the alias is checked as its right-hand side: a mismatch is the ordinary E-TYPE-031", () => {
    const cs = codes(L(`    type Id = int;\n    fn f(x: Id) -> string {\n        return x;\n    }`, `<p>\${f(1)}</p>`));
    expect(cs).toEqual(["E-TYPE-031"]);
  });

  test("an unknown name on the right-hand side is reported once, at the declaration", () => {
    const src = L(`    type C = Nope;\n    fn g(x: C) -> int {\n        return 1;\n    }\n    fn h(x: C) -> int {\n        return 2;\n    }`, `<p>\${g(1)}</p>`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-TYPE-UNKNOWN"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toBe("Nope");
  });

  test("a recursive alias is refused by name at each alias, and its uses report nothing more", () => {
    const cs = codes(L(`    type A = B;\n    type B = A[];\n    fn f(x: A) -> int {\n        return 1;\n    }`, `<p>\${f([])}</p>`));
    expect(cs).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("an alias takes `;` (§7.2.2 rule 1 — not a `type … = { … }` item)", () => {
    const cs = codes(L(`    type Id = int\n    fn f(x: Id) -> Id {\n        return x;\n    }`, `<p>\${f(1)}</p>`));
    expect(cs).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });

  test("an exported alias is importable", () => {
    const r = frontEnd(mods, [
      { path: "t.scrml", src: `\${\n    import { Id } from "./ty.scrml";\n    fn f(x: Id) -> Id {\n        return x;\n    }\n}\n<program>\n    <p>\${f(1)}</p>\n</program>\n` },
      { path: "ty.scrml", src: `\${\n    export type Id = int;\n}\n` },
    ], "t.scrml");
    expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  });

  test("the `:kind` forms are unchanged; `type E : error` is not a kind (§14.2, S479)", () => {
    expect(codes(L(`    type S:struct = { a: int }\n    type K:enum = { A, B }`))).toEqual([]);
    expect(codes(L(`    type MyError : error = { message : string }`))).toEqual(["E-PARSE-TYPE"]);
  });
});

// s478 r1 (review HIGH-1) — §34 E-SCOPE-010: a file-scope name is bound once "whatever the two
// bindings name … a `type`". An alias builds no TypeInfo, yet it is a file-scope type binding.
describe("§7.6 / §34 E-SCOPE-010 — an alias is a file-scope binding", () => {
  const scope = (logic, markup) => codes(L(logic, markup)).filter((c) => c === "E-SCOPE-010").length;

  test("two aliases of one name", () => {
    expect(scope(`    type A = int;\n    type A = string;`)).toBe(1);
  });
  test("an alias and a struct of one name", () => {
    expect(scope(`    type A:struct = { a: int }\n    type A = string;`)).toBe(1);
  });
  test("an alias and a constant", () => {
    expect(scope(`    type A = int;\n    const A = 3;`)).toBe(1);
  });
  test("an alias and a function", () => {
    expect(scope(`    type f = int;\n    fn f() -> int {\n        return 1;\n    }`, `<p>\${f()}</p>`)).toBe(1);
  });
  test("an alias and a program cell", () => {
    expect(scope(`    type A = int;`, `let <A:int=1/>\n    <p>\${@A}</p>`)).toBe(1);
  });
  test("an alias beside an import of its name: one E-SCOPE-010, at the import", () => {
    const r = frontEnd(mods, [
      { path: "t.scrml", src: `\${\n    import { Id } from "./ty.scrml";\n    type Id = string;\n    fn f(x: Id) -> Id {\n        return x;\n    }\n}\n<program>\n    <p>\${f("a")}</p>\n</program>\n` },
      { path: "ty.scrml", src: `\${\n    export type Id = int;\n}\n` },
    ], "t.scrml");
    expect(r.diags.filter((d) => d.code === "E-SCOPE-010").length).toBe(1);
  });
});
