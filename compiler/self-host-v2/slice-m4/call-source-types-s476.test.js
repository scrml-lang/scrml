// call-source-types-s476.test.js — s476-boot-call-source-types: two LOW adopter frictions from the
// lotto-analyzer app, both in compiler/self-host-v2/analyze.scrml.
//
// 1. A `<each in=…>` / `for (x of …)` source that is a CALL lost the callee's declared element type:
//    `<each in=mk() as f>${f.a}` with `fn mk() -> F[]` was E-BOOTSTRAP-UNSUPPORTED "member access `.a` on a
//    value that is not a struct or an instance". SPEC §17.7.2 (`<each in=expr>`: "The `in=` value SHALL be a
//    sequence"), §49.3.5 ("For each element, in the iterable's order, the binder is bound to the element"),
//    §48.8 (a `-> T` annotation is the function's return type), §66.3 rule 5 (g) ("a call `f(…)` of a function
//    whose return type is DECLARED (`-> T`) … | that return type"). The source's declared return type now
//    flows to the binder, both forms.
//    An UNTYPED callee (no `-> T`): §48.8 "The compiler infers the return type from the `return` statements"
//    — not built for a loop source in the bootstrap; refused by name, INTERIM, with the capable forms named
//    (declare `-> T[]`, or bind first with an annotation).
// 2. An array literal was not a typed receiver: `[10, 9, 2].sort()` was E-BOOTSTRAP-UNSUPPORTED "a built-in
//    method needs a receiver of a known type". §66.3 rule 5 (a): "a non-empty sequence literal `[…]` whose
//    elements are all such literals of one base type | the literal's (rule 3); `[1, 2, 3]` → `int[]`,
//    `[1, 2.5]` → `number[]`". `.join` on an `int[]` keeps its E-TYPE-031 (no ruled int→string conversion,
//    g-bootstrap-int-to-string-conversion-unruled-s469) — the same refusal a typed `int[]` local gets.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const fe = (src) => frontEnd(mods, [{ path: ENTRY, src: `<program>\n${src}\n</program>\n` }], ENTRY);
const codes = (r) => errs(r).map((d) => d.code);
const $ = (sel) => document.querySelector(sel);
let k = 0;

const F = "type F:struct = { a: int }\n";
const MK = "fn mk() -> F[] { let out: F[free, append] = []; out.append({ a: 1 }); out.append({ a: 2 }); return out; }\n";
const MK_UNTYPED = "fn mk() { let out: F[free, append] = []; out.append({ a: 1 }); return out; }\n";

describe("1. a call as an each / for source keeps its declared element type", () => {
  test("`<each in=mk() as f>${f.a}` with `fn mk() -> F[]` compiles and renders each row (was: E-BOOTSTRAP-UNSUPPORTED member access)", async () => {
    const r = fe(F + MK + `<main><ol id="o"><each in=mk() as f><li>\${f.a}</li></each></ol></main>`);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s476-cst-each-" + k++);
    expect($("#o").textContent).toBe("12");
  });
  test("`for (x of mk()) { … x.a … }` inside a `fn` compiles and runs (was: E-BOOTSTRAP-UNSUPPORTED member access)", async () => {
    const r = fe(F + MK + "fn tot() -> int { let s: int = 0; for (x of mk()) { s = s + x.a; } return s; }\n" + `<main><p id="t">\${tot()}</p></main>`);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s476-cst-for-" + k++);
    expect($("#t").textContent).toBe("3");
  });
  test("a `-> F[] | not` source iterates the sequence inside (§17.7.2: `S | not` is admitted)", () => {
    const r = fe(F + "fn mk(n: int) -> F[] | not { if (n > 0) { const xs: F[] = [{ a: n }]; return xs; } return not; }\n" + `<main><ol><each in=mk(1) as f><li>\${f.a}</li></each></ol></main>`);
    expect(errs(r)).toEqual([]);
  });
  test("a call source typed as a non-sequence is still E-EACH-NOT-SEQUENCE (unchanged)", () => {
    const r = fe("fn mk() -> int { return 3; }\n" + `<main><ol><each in=mk() as f><li>\${f}</li></each></ol></main>`);
    expect(codes(r)).toEqual(["E-EACH-NOT-SEQUENCE"]);
  });
  test("near-miss: the bind-first workaround still compiles (unchanged)", () => {
    const r = fe(F + MK + "fn tot() -> int { const xs: F[] = mk(); let s: int = 0; for (x of xs) { s = s + x.a; } return s; }\n" + `<main><p>\${tot()}</p></main>`);
    expect(errs(r)).toEqual([]);
  });
  test("an UNTYPED callee: the refusal names the real limit and the workaround (INTERIM) — each form", () => {
    const src = F + MK_UNTYPED + `<main><ol><each in=mk() as f><li>\${f.a}</li></each></ol></main>`;
    const r = fe(src);
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const full = `<program>\n${src}\n</program>\n`;
    expect(full.slice(e[0].span.start, e[0].span.end)).toBe("f.a");
    expect(e[0].message).toContain("an each/for source that is a call");
    expect(e[0].message).toContain("`mk(…)` declares no return type");
    expect(e[0].message).toContain("INTERIM");
    expect(e[0].message).toContain("-> T[]");
    expect(e[0].message).toContain("const xs: T[] = mk(…)");
  });
  test("an UNTYPED callee: the same named refusal in the for form", () => {
    const r = fe(F + MK_UNTYPED + "fn tot() -> int { let s: int = 0; for (x of mk()) { s = s + x.a; } return s; }\n" + `<main><p>\${tot()}</p></main>`);
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("an each/for source that is a call");
    expect(e[0].message).toContain("`mk(…)` declares no return type");
  });
  test("near-miss: an untyped binder that is NOT from a call keeps the old message", () => {
    const r = fe("fn g(x) -> int { return x.a; }\n<main><p>${g(1)}</p></main>");
    for (const d of errs(r)) expect(d.message).not.toContain("an each/for source that is a call");
  });
});

describe("2. a homogeneous array literal is a typed receiver", () => {
  test("`[10, 9, 2].sort()` is an `int[]` receiver: compiles and renders in order (was: E-BOOTSTRAP-UNSUPPORTED)", async () => {
    const r = fe(`<main><ol id="o"><each in=[10, 9, 2].sort() as n><li>\${n}</li></each></ol></main>`);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s476-cst-sort-" + k++);
    expect([...document.querySelectorAll("#o li")].map((n) => n.textContent)).toEqual(["2", "9", "10"]);
  });
  test("`[\"b\", \"a\"].sort().join(\",\")` — a `string[]` literal joins (was: two E-BOOTSTRAP-UNSUPPORTED)", async () => {
    const r = fe(`<main><p id="p">\${["b", "a", "c"].sort().join(",")}</p></main>`);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s476-cst-join-" + k++);
    expect($("#p").textContent).toBe("a,b,c");
  });
  test("`[1, 2.5].includes(2.5)` — a mixed int/number literal is a `number[]` (§66.3 rule 5 (a))", async () => {
    const r = fe(`<main><p id="p">\${[1, 2.5].includes(2.5) ? "y" : "n"}</p></main>`);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s476-cst-incl-" + k++);
    expect($("#p").textContent).toBe("y");
  });
  test("`[10, 9, 2].sort().join(\",\")` — `.join` on an `int[]` keeps the typed-local refusal E-TYPE-031 (int→string unruled)", () => {
    const lit = errs(fe(`<main><p>\${[10, 9, 2].sort().join(",")}</p></main>`));
    expect(lit.map((d) => d.code)).toEqual(["E-TYPE-031"]);
    const typed = errs(fe("fn j() -> string { const xs: int[] = [10, 9, 2]; return xs.sort().join(\",\"); }\n<main><p>${j()}</p></main>"));
    expect(typed.map((d) => d.code)).toEqual(["E-TYPE-031"]);
    expect(lit[0].message).toBe(typed[0].message);
  });
  test("a heterogeneous literal is refused by name: its elements are not of one type", () => {
    const e = errs(fe(`<main><p>\${["a", 1].sort().length}</p></main>`));
    expect(e.length).toBeGreaterThan(0);
    expect(e[0].code).toBe("E-BOOTSTRAP-UNSUPPORTED");
    expect(e[0].message).toContain("array literal");
    expect(e[0].message).toContain("one base type");
    expect(e[0].message).not.toContain("INTERIM");
  });
  test("a literal of non-literal elements is refused by name, INTERIM, with the typed-local workaround", () => {
    const e = errs(fe("fn f(a: int, b: int) -> int[] { return [a, b].sort(); }\n<main><p>${f(2, 1).length}</p></main>"));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("INTERIM");
    expect(e[0].message).toContain("const xs: T[] = […]");
  });
  test("near-miss: the same elements through a typed local compile (unchanged)", () => {
    const r = fe("fn f(a: int, b: int) -> int { const xs: int[] = [a, b]; return xs.sort().length; }\n<main><p>${f(2, 1)}</p></main>");
    expect(errs(r)).toEqual([]);
  });
});
