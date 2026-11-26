// invariant-decl-s483.test.js — lane s483-invariant-1: Q21 struct invariant, LANE 1 of 3 (parse +
// declaration-side analysis + static errors). SPEC §66.13.5.
//
// RULED: ruling:user-voice-scrml.md-S482-struct-invariant-contract (Q21 = (a): "an invariant on the
// declaration itself (e.g. `start < end`), checked on every write from any writer like the other kinds, a
// violating write rejected") and ruling:user-voice-scrml.md-S483-struct-invariant-syntax item 1: "`invariant
// (expr)` after the closer, bare field names (the `renders` scope), optional `[label]`; several clauses
// allowed; `type X:struct = {…} invariant (expr)` on the type form. Reads only the value's own fields,
// literals and pure `fn` calls; an `@cell` read is E-CONTRACT-003." Item 2: "Provable violation
// E-WRITE-INVARIANT, otherwise the E-WRITE-INVARIANT-RT trap before any write (S477)" — the run-time half is
// lane 2 (g-boot-invariant-write-checks-s483); this file pins the static half.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-invariant-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let k = 0;
async function result(src) {
  const d = join(dir, `p${k++}`);
  mkdirSync(d);
  const file = join(d, "main.scrml");
  writeFileSync(file, src);
  return await compileSource(file);
}
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error");
const codes = (r) => errs(r).map((d) => d.code);
const prog = (body) => `<program>\n${body}\n</program>\n`;

const RANGE = `    <dateRange:struct>
        let <start:int=0/>
        let <end:int=0/>
    </>`;

describe("accepted: the clause after a declaration's closer and after a `type :struct` body", () => {
  const ok = [
    ["one clause with a label", `${RANGE}\n    invariant (start <= end) [ordered]\n    <main><p>\${@dateRange.start}</p></main>`],
    ["several clauses, `renders` between them (either order)",
      `    <band:struct>\n        let <low:int=18/>\n        let <mid:int=21/>\n        let <high:int=24/>\n    </>\n    invariant (low <= mid) [lowMid]\n    renders <span>\${low}–\${high}</span>\n    invariant (mid <= high)\n    <main><p>\${@band.low}</p></main>`],
    ["attributes are fields an invariant reads",
      `    <slider min:int=0 max:int=100>\n        let <value:int=50/>\n    </>\n    invariant (min <= value && value <= max)\n    renders <span>\${value}</span>\n    <main><slider min=10 max=90/></main>`],
    ["a pure `fn` call, enum variants, `is given`",
      `    fn ordered(a: int, b: int) -> bool { return a <= b; }\n    type Status:enum = { Placed, Shipped }\n    <order:struct>\n        let <a:int=1/>\n        let <b:int=2/>\n        let <status:Status=.Placed/>\n        let <note:string | not=not/>\n    </>\n    invariant (ordered(a, b))\n    invariant (status != .Shipped || note is given)\n    <main><p>\${@order.a}</p></main>`],
    ["the type form at the file top, several clauses",
      "type Band:struct = { low: int, mid: int, high: int } invariant (low <= mid) [lowMid] invariant (mid <= high)\n" + prog(`    let <b:Band=({ low: 1, mid: 2, high: 3 })/>\n    <main><p>\${@b.low}</p></main>`)],
    ["the type form inside a logic block",
      prog("    ${ type Range:struct = { lo: int, hi: int } invariant (lo <= hi) }\n    let <r:Range=({ lo: 1, hi: 2 })/>\n    <main><p>${@r.lo}</p></main>")],
    ["a function named `invariant` is still called anywhere else (no clause position)",
      `    fn invariant(x: int) -> bool { return x > 0; }\n    <main><p>\${invariant(3)}</p></main>`],
    ["deterministic built-in methods and a `x => expr` callback, directly (r1 F3)",
      `    <person:struct>\n        let <first:string=""/>\n        let <last:string=""/>\n    </>\n    invariant (first.trim().toUpperCase() != "X" || last.length == 0)\n    invariant ([first, last].some(x => x != ""))\n    <main><p>\${@person.first}</p></main>`],
    ["a `fn` chain that computes only from its arguments (r1 F1)",
      `    fn width(a: int, b: int) -> int { return b - a; }\n    fn ok(a: int, b: int) -> bool { return width(a, b) >= 0; }\n${RANGE}\n    invariant (ok(start, end))\n    <main><p>\${@dateRange.start}</p></main>`],
    ["a computed write compiles (its check is run time — lane 2)",
      `${RANGE}\n    invariant (start <= end)\n    function shift(n: int) { @dateRange = { ...@dateRange, start: @dateRange.start + n, end: @dateRange.end + n }; }\n    <main><button onclick=shift(1)>x</button></main>`],
  ];
  for (const [name, src] of ok) {
    test(name, async () => {
      const r = await result(src.startsWith("<program>") || src.startsWith("type ") ? src : prog(src));
      expect(codes(r)).toEqual([]);
      expect(r.ok).toBe(true);
    }, 120000);
  }
});

describe("refused at the declaration", () => {
  test("`invariant (…)` inside an opener: E-DECL-INVARIANT-IN-OPENER (the clause follows the closer)", async () => {
    const r = await result(prog("    <r:struct invariant (a <= b)>\n        let <a:int=0/>\n        let <b:int=0/>\n    </>\n    <main><p>${@r.a}</p></main>"));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IN-OPENER"]);
    expect(errs(r)[0].message).toContain("`invariant` follows the closer (`/>` or `</>`)");
  }, 120000);

  test("a scalar cell: E-DECL-INVARIANT-NO-FIELDS, naming the refinement type", async () => {
    const r = await result(prog("    let <n:int=0/> invariant (n >= 0)\n    <main><p>${@n}</p></main>"));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-NO-FIELDS"]);
    expect(errs(r)[0].message).toContain("`int(>=0)`");
  }, 120000);

  test("a cell of an existing type: E-DECL-INVARIANT-NO-FIELDS, naming the type's declaration", async () => {
    const r = await result("type Range:struct = { lo: int, hi: int }\n" + prog("    let <r:Range=({ lo: 1, hi: 2 })/> invariant (lo <= hi)\n    <main><p>${@r.lo}</p></main>"));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-NO-FIELDS"]);
    expect(errs(r)[0].message).toContain("inherits that type's invariants");
  }, 120000);

  test("not a `bool`: E-DECL-INVARIANT-NOT-BOOL", async () => {
    const r = await result(prog(`${RANGE}\n    invariant (start + end)\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-NOT-BOOL"]);
  }, 120000);

  test("the type form, not a `bool`: E-DECL-INVARIANT-NOT-BOOL", async () => {
    const r = await result("type Range:struct = { lo: int, hi: int } invariant (lo + hi)\n" + prog("    let <r:Range=({ lo: 1, hi: 2 })/>\n    <main><p>${@r.lo}</p></main>"));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-NOT-BOOL"]);
  }, 120000);

  test("an `@` read: E-CONTRACT-003, pointing to a derived check", async () => {
    const r = await result(prog(`    let <limit:int=3/>\n${RANGE}\n    invariant (start <= @limit)\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual(["E-CONTRACT-003"]);
    expect(errs(r)[0].message).toContain("derived check");
  }, 120000);

  const impure = [
    ["a `function` call", "    function check() { return true; }\n", "invariant (check())", "declared `function`"],
    ["a host call (r1 F3: a method on a host global)", "", "invariant (Date.now() > start)", "a host global"],
    ["a file-scope `let` (r1 F6: named a `let`, not a constant)", "    ${ let lim = 3; }\n", "invariant (end <= lim)", "the file-scope `let` `lim`"],
    // s483-invariant-2 (ruling:user-voice-scrml.md-S483-invariant-const-read): a compile-time constant
    // (`const LIMIT = 3`) is admitted — invariant-write-s483.test.js; a non-constant initializer stays refused
    ["a file-scope constant whose initializer is not a compile-time constant", "    ${ const LIMIT = 1 + 2; }\n", "invariant (end <= LIMIT)", "not a compile-time constant"],
    ["a write", "", "invariant (start = 1)", "writes a value"],
  ];
  for (const [name, pre, clause, msg] of impure) {
    test(`${name}: E-DECL-INVARIANT-IMPURE`, async () => {
      const r = await result(prog(`${pre}${RANGE}\n    ${clause}\n    <main><p>\${@dateRange.start}</p></main>`));
      expect(codes(r)).toContain("E-DECL-INVARIANT-IMPURE");
      expect(codes(r).filter((c) => c !== "E-DECL-INVARIANT-IMPURE")).toEqual([]);
      expect(errs(r).find((d) => d.code === "E-DECL-INVARIANT-IMPURE").message).toContain(msg);
    }, 120000);
  }

  test("a nested child field with fields of its own: refused by name (INTERIM), never accepted unchecked", async () => {
    const r = await result(prog("    <trip:struct>\n        let <name:string=\"\"/>\n        <range:struct>\n            let <a:int=0/>\n            let <b:int=0/>\n        </>\n        invariant (a <= b)\n    </>\n    <main><p>${@trip.name}</p></main>"));
    expect(codes(r)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(errs(r).find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("g-boot-invariant-nested-field-s483");
  }, 120000);
});

describe("static E-WRITE-INVARIANT — a literal value provably breaks the invariant", () => {
  test("the declaration's defaults (its shared instance and `reset` target)", async () => {
    const r = await result(prog("    <dateRange:struct>\n        let <start:int=5/>\n        let <end:int=1/>\n    </>\n    invariant (start <= end) [ordered]\n    <main><p>${@dateRange.start}</p></main>"));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    const m = errs(r)[0].message;
    expect(m).toContain("`[ordered]`");
    expect(m).toContain("start = 5, end = 1");
  }, 120000);

  test("a use site's literal attributes", async () => {
    const r = await result(prog("    <slider min:int=0 max:int=100>\n        let <value:int=50/>\n    </>\n    invariant (min <= value && value <= max)\n    renders <span>${value}</span>\n    <main><slider min=60 max=10/></main>"));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    expect(errs(r)[0].message).toContain("the use `<slider>`");
  }, 120000);

  test("an object literal into a cell typed by the type (inherited)", async () => {
    const r = await result("type Band:struct = { low: int, mid: int, high: int } invariant (low <= mid) [lowMid] invariant (mid <= high)\n" + prog("    let <b:Band=({ low: 5, mid: 1, high: 9 })/>\n    <main><p>${@b.low}</p></main>"));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    expect(errs(r)[0].message).toContain("`[lowMid]`");
  }, 120000);

  test("a whole write of an object literal", async () => {
    const r = await result("type Band:struct = { low: int, high: int } invariant (low <= high)\n" + prog("    let <b:Band=({ low: 1, high: 9 })/>\n    function bump() { @b = { low: 10, high: 2 }; }\n    <main><button onclick=bump()>x</button></main>"));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
  }, 120000);

  test("the grouped write: a spread whose literal overrides break it (ruling S483 item 2)", async () => {
    const r = await result(prog(`${RANGE}\n    invariant (start <= end)\n    function f() { @dateRange = { ...@dateRange, start: 10, end: 2 }; }\n    <main><button onclick=f()>x</button></main>`));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    expect(errs(r)[0].message).toContain("start = 10, end = 2");
  }, 120000);

  test("a spread override that reads an unknown value is no static claim (the run-time check's, lane 2)", async () => {
    const r = await result(prog(`${RANGE}\n    invariant (start <= end)\n    function f(n: int) { @dateRange = { ...@dateRange, start: n }; }\n    <main><button onclick=f(1)>x</button></main>`));
    expect(codes(r)).toEqual([]);
  }, 120000);

  test("a literal that keeps the invariant is accepted; a `&&` with a known-false side is decided", async () => {
    const ok = await result("type Band:struct = { low: int, high: int } invariant (low <= high)\n" + prog("    let <b:Band=({ low: 1, high: 1 })/>\n    <main><p>${@b.low}</p></main>"));
    expect(codes(ok)).toEqual([]);
    const bad = await result(prog("    <slider min:int=0 max:int=100>\n        let <value:int=50/>\n    </>\n    invariant (min <= value && value <= max)\n    renders <span>${value}</span>\n    <main><slider max=10/></main>"));
    expect(codes(bad)).toEqual(["E-WRITE-INVARIANT"]);
  }, 120000);
});

// ---- r1 (PR #2120 review) ----------------------------------------------------------------------------
// F1 HIGH (prov=pa-ruled:S483-fn-chain-purity): a `fn` called from an invariant — directly or through other
// `fn`s — reads exactly what the invariant may read directly: a cell is E-CONTRACT-003, a file-scope `let` /
// constant E-DECL-INVARIANT-IMPURE, each naming the call chain. Review probes b03, b04 + adjacent.
describe("r1 F1 — a `fn` reached from an invariant reads no cell and no outer binding", () => {
  const cases = [
    ["b03: a `fn` reading a cell", "    let <limit:int=3/>\n    ${ fn ok(a: int, b: int) -> bool { return b - a <= @limit; } }\n", "invariant (ok(start, end))", "E-CONTRACT-003", ["calls `ok`, which reads the cell `@limit`"]],
    ["b04: a `fn` reading a mutable file-scope `let`", "    ${ let lim = 3;\n       fn ok(a: int, b: int) -> bool { return b - a <= lim; }\n       function bump() { lim = lim + 1; } }\n", "invariant (ok(start, end))", "E-DECL-INVARIANT-IMPURE", ["the file-scope `let` `lim`", "a write can change it"]],
    ["a two-deep chain to a cell, naming the chain", "    let <limit:int=3/>\n    ${ fn inner(a: int) -> int { return a + @limit; }\n       fn ok(a: int, b: int) -> bool { return b <= inner(a); } }\n", "invariant (ok(start, end))", "E-CONTRACT-003", ["(through `ok` → `inner`)", "`@limit`"]],
    // s483-invariant-2: a compile-time constant is admitted through the chain too; a non-constant one is not
    ["a `fn` reading a non-constant file-scope constant (the direct-read rule, exactly)", "    ${ const MAXW = 10 + 20;\n       fn ok(a: int, b: int) -> bool { return b - a <= MAXW; } }\n", "invariant (ok(start, end))", "E-DECL-INVARIANT-IMPURE", ["the file-scope constant `MAXW`", "not a compile-time constant"]],
    ["a `fn` reading a cell on one branch only", "    let <limit:int=3/>\n    ${ fn ok(a: int, b: int) -> bool { if (a > 100) { return b <= @limit; } return a <= b; } }\n", "invariant (ok(start, end))", "E-CONTRACT-003", ["`@limit`"]],
  ];
  for (const [name, pre, clause, code, msgs] of cases) {
    test(name, async () => {
      const r = await result(prog(`${pre}${RANGE}\n    ${clause}\n    <main><p>\${@dateRange.start}</p></main>`));
      expect(codes(r)).toEqual([code]);
      for (const m of msgs) expect(errs(r)[0].message).toContain(m);
    }, 120000);
  }

  test("the type form: a `fn` reading a file-scope `let`", async () => {
    const r = await result(prog("    ${ let lim = 3;\n       fn ok(a: int, b: int) -> bool { return b - a <= lim; }\n       function bump() { lim = lim + 1; }\n       type Range:struct = { lo: int, hi: int } invariant (ok(lo, hi))\n    }\n    let <r:Range=({ lo: 1, hi: 2 })/>\n    <main><button onclick=bump()>${@r.lo}</button></main>"));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toContain("on `type Range` calls `ok`");
  }, 120000);
});

// F2 MED (prov=pa-ruled:S483-capture-never-silent): `invariant (` right after a closer / a `:struct` body is the
// clause; a binding named `invariant` in scope there makes the clause E-DECL-INVARIANT-CAPTURES-CALL — never a
// silent drop of a call. Review probes a18, a23, a24.
describe("r1 F2 — a captured `invariant(…)` call is never silent", () => {
  const cases = [
    ["a24: a `function invariant` call after a declaration's closer", "    function invariant(x: bool) { @hits = @hits + 1; }\n    let <hits:int=0/>\n    <r:struct>\n        let <a:int=0/>\n    </>\n    invariant(true);\n    <main><p>${@hits}</p></main>", "the `function` `invariant`"],
    ["a23: a non-bool argument gets the named diagnostic, not E-DECL-INVARIANT-NOT-BOOL", "    function invariant(x: int) { @hits = @hits + x; }\n    let <hits:int=0/>\n    <r:struct>\n        let <a:int=0/>\n    </>\n    invariant(1);\n    <main><p>${@hits}</p></main>", "rename it or move the call"],
    ["a18: after a `type :struct` body in a logic block", "    ${\n        function invariant(x: bool) { @hits = @hits + 1; }\n        type R:struct = { lo: int, hi: int }\n        invariant(true);\n    }\n    let <hits:int=0/>\n    <main><p>${@hits}</p></main>", "on `type R`"],
  ];
  for (const [name, body, msg] of cases) {
    test(name, async () => {
      const r = await result(prog(body));
      expect(codes(r)).toEqual(["E-DECL-INVARIANT-CAPTURES-CALL"]);
      expect(errs(r)[0].message).toContain("is read as an invariant clause");
      expect(errs(r)[0].message).toContain(msg);
    }, 120000);
  }
});

// s483-invariant-2 (#2120 r1 re-review L1, prov=pa-ruled:S483-capture-callable-only): a binding named `invariant`
// captures the clause only when it can be called — `const invariant = 3` cannot, so the clause is a clause.
test("L1: a non-callable constant named `invariant` does not capture the clause (probe a09)", async () => {
  const r = await result(prog("    ${ const invariant = 3; }\n    <r2:struct>\n        let <a:int=0/>\n        let <b:int=1/>\n    </>\n    invariant (a <= b)\n    <main><p>${@r2.a}</p></main>"));
  expect(codes(r)).toEqual([]);
}, 120000);

// F3 MED (prov=pa-ruled:S483-direct-equals-fn-purity): what a pure `fn` body may use on its own values is
// allowed directly; what it may not stays refused. Review probes b06 (now accepted, as b21 was).
describe("r1 F3 — direct purity equals pure-`fn` purity", () => {
  test("b06: `.trim()` directly, as inside a `fn` (b21)", async () => {
    const r = await result(prog("    <person:struct>\n        let <first:string=\"\"/>\n        let <last:string=\"\"/>\n    </>\n    invariant (first.trim() != \"\" || last.length == 0)\n    <main><p>${@person.first}</p></main>"));
    expect(codes(r)).toEqual([]);
  }, 120000);

  test("a callback reading a non-constant file-scope constant: E-DECL-INVARIANT-IMPURE", async () => {
    const r = await result(prog(`    \${ const K = 2 + 3; }\n${RANGE}\n    invariant ([start, end].some(x => x > K))\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toContain("`K`");
  }, 120000);

  test("s483-invariant-2: a callback reading a compile-time constant is admitted (ruling S483-invariant-const-read)", async () => {
    const r = await result(prog(`    \${ const K = 5; }\n${RANGE}\n    invariant ([start, end].some(x => x > K))\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual([]);
  }, 120000);

  test("a block-bodied callback: refused by name (INTERIM)", async () => {
    const r = await result(prog(`${RANGE}\n    invariant ([start, end].some(x => { return x > 5; }))\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toContain("g-boot-invariant-block-lambda-s483");
  }, 120000);
});

// F4 MED: the §53.8.1 Booking example (int-comparable fields) compiles, and a literal that breaks it is caught.
describe("r1 F4 — the §53.8.1 Booking example", () => {
  const BOOKING = "    ${\n    type Booking:struct = {\n        checkIn:  int,\n        checkOut: int,\n        nights:   int\n    } invariant (checkIn < checkOut) [validDateRange]\n      invariant (checkOut - checkIn == nights) [nightsMatch]\n    }\n";
  test("compiles", async () => {
    const r = await result(prog(BOOKING + "    let <booking:Booking=({ checkIn: 20260601, checkOut: 20260608, nights: 7 })/>\n    <main><p>${@booking.nights}</p></main>"));
    expect(codes(r)).toEqual([]);
    expect(r.ok).toBe(true);
  }, 120000);
  test("a literal booking that ends before it starts: E-WRITE-INVARIANT naming the label", async () => {
    const r = await result(prog(BOOKING + "    let <booking:Booking=({ checkIn: 20260608, checkOut: 20260601, nights: 7 })/>\n    <main><p>${@booking.nights}</p></main>"));
    expect(codes(r)).toContain("E-WRITE-INVARIANT");
    expect(errs(r).map((d) => d.message).join("\n")).toContain("`[validDateRange]`");
  }, 120000);
});
