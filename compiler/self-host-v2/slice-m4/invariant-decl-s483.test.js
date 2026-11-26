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
    ["a function named `invariant` is still called anywhere else",
      `    fn invariant(x: int) -> bool { return x > 0; }\n${RANGE}\n    invariant (start <= end)\n    <main><p>\${invariant(3)}</p></main>`],
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
    ["a method call", "", "invariant (start.toString() == \"0\")", "not a declared `fn`"],
    ["a file-scope constant", "    ${ const LIMIT = 3; }\n", "invariant (end <= LIMIT)", "file-scope constant"],
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
