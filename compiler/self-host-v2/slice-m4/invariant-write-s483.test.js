// invariant-write-s483.test.js — lane s483-invariant-2: Q21 struct invariant, LANE 2 of 3 (write-site and
// run-time checks). SPEC §66.13.5 "When it is checked", "Evaluation order", "Failure".
//
// RULED: ruling:user-voice-scrml.md-S483-struct-invariant-syntax item 2 — "check every write, as ruled. The
// grouped write is the existing spread `@r = { ...@r, start: a, end: b }`: one snapshot, all or nothing, checked
// once." — "Provable violation E-WRITE-INVARIANT, otherwise the E-WRITE-INVARIANT-RT trap before any write
// (S477)"; S477 supersedes S440 (a refused write traps and writes nothing).
// ruling:user-voice-scrml.md-S483-invariant-const-read — "Allow compile-time consts (Recommended)": a file-scope
// const whose initializer is a compile-time constant (literals, enum variants, other such consts) and that is not
// server-only, directly and through a fn chain; "A `let`, a host-derived const, or a server-only const stays
// refused."
//
// Each write kind × (passes, compile-time refusal, run-time trap: value unchanged, nothing notified). Shipping path
// (scripts/scrml-boot.ts compileSource → print.scrml), run in happy-dom (bootstrap-conformance runBootstrapArtifact);
// the run-time traps again in Chromium: compiler/tests/browser/invariant-write-chromium-s483.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-invariant-write-")); });
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

// run the compiled program in happy-dom, clicking `clicks` in order; the texts of `ids` after, and the traps raised
async function run(r, ids, clicks) {
  if (!r.ok) throw new Error("did not compile: " + errs(r).map((d) => d.code + " " + d.message).join("; "));
  const traps = [];
  const orig = console.error;
  console.error = (...a) => { traps.push(a.map(String).join(" ")); };
  let out = null;
  // a trap the runtime does not catch (raised while the page is built, or a plain runtime Error from a
  // listener) reaches the process: recorded, not raised into the test
  const onErr = (e) => { traps.push(String(e?.message ?? e)); };
  process.on("uncaughtException", onErr);
  process.on("unhandledRejection", onErr);
  try {
    out = await runBootstrapArtifact(r.client.html, r.client.js, clicks.map((c) => ({ click: c })), {}, [], undefined);
    await new Promise((res) => setTimeout(res, 20));
  } catch (e) {
    traps.push(String(e?.message ?? e));
  } finally {
    console.error = orig;
    process.off("uncaughtException", onErr);
    process.off("unhandledRejection", onErr);
  }
  const texts = out ? ids.map((id) => String(out.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim()) : [];
  return { texts, traps: traps.filter((t) => t.includes("E-")) };
}

const RANGE = `    <dateRange:struct>
        let <start:int=0/>
        let <end:int=10/>
    </>
    invariant (start <= end) [ordered]`;

describe("a direct field write", () => {
  const src = prog(`${RANGE}
    function setStart(n: int) { @dateRange.start = n; }
    <main><p id="s">\${@dateRange.start}</p><p id="e">\${@dateRange.end}</p>
    <button id="ok" onclick=setStart(4)>ok</button><button id="bad" onclick=setStart(20)>bad</button></main>`);

  test("passes: the field is written", async () => {
    const o = await run(await result(src), ["s", "e"], ["#ok"]);
    expect(o.texts).toEqual(["4", "10"]);
    expect(o.traps).toEqual([]);
  }, 120000);

  test("traps E-WRITE-INVARIANT-RT before the write: nothing written, the message names the declaration, the label and the candidate values", async () => {
    const o = await run(await result(src), ["s", "e"], ["#bad"]);
    expect(o.texts).toEqual(["0", "10"]);
    expect(o.traps.length).toBe(1);
    expect(o.traps[0]).toContain("E-WRITE-INVARIANT-RT");
    expect(o.traps[0]).toContain("[ordered]");
    expect(o.traps[0]).toContain("<dateRange>");
    expect(o.traps[0]).toContain("start = 20, end = 10");
  }, 120000);

  test("the printed check is readable: the clause as a function of the fields it reads", async () => {
    const r = await result(src);
    expect(r.client.js).toContain("rt.invariantGuard(dateRange$, [[0, [], \"set\", n]], [[[], (start, end) => start <= end, [\"start\", \"end\"], \"<dateRange>\", \"[ordered]\"]]");
  }, 120000);

  test("a provable violation is the compile-time E-WRITE-INVARIANT (a literal decides a one-field invariant)", async () => {
    const r = await result(prog(`    <counter:struct>
        let <n:int=0/>
    </>
    invariant (n >= 0) [nonNegative]
    function down() { @counter.n = -1; }
    <main><button onclick=down()>\${@counter.n}</button></main>`));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    expect(errs(r)[0].message).toContain("[nonNegative]");
  }, 120000);

  test("a write that touches no field the invariant reads has no check", async () => {
    const r = await result(prog(`    <rec:struct>
        let <start:int=0/>
        let <end:int=10/>
        let <note:string=""/>
    </>
    invariant (start <= end)
    function setNote(s: string) { @rec.note = s; }
    <main><button onclick=setNote("x")>\${@rec.note}</button></main>`));
    expect(codes(r)).toEqual([]);
    expect(r.client.js).not.toContain("invariantGuard(rec$");
  }, 120000);
});

describe("a spread — the grouped write: one snapshot, all or nothing, checked once", () => {
  const src = prog(`${RANGE}
    function shift(n: int) { @dateRange = { ...@dateRange, start: @dateRange.start + n, end: @dateRange.end + n }; }
    function squeeze(a: int, b: int) { @dateRange = { ...@dateRange, start: a, end: b }; }
    <main><p id="s">\${@dateRange.start}</p><p id="e">\${@dateRange.end}</p>
    <button id="sh" onclick=shift(15)>sh</button><button id="bad" onclick=squeeze(9, 3)>bad</button></main>`);

  test("passes: both fields move together (the split writes would trap)", async () => {
    const o = await run(await result(src), ["s", "e"], ["#sh"]);
    expect(o.texts).toEqual(["15", "25"]);
    expect(o.traps).toEqual([]);
  }, 120000);

  test("traps before any write: neither field is written (all or nothing)", async () => {
    const r = await result(src);
    const o = await run(r, ["s", "e"], ["#bad"]);
    expect(o.texts).toEqual(["0", "10"]);
    expect(o.traps.length).toBe(1);
    expect(o.traps[0]).toContain("start = 9, end = 3");
  }, 120000);

  test("the check is one InvariantGuard after the writes' own checks, before the batch", async () => {
    const r = await result(src);
    expect(r.client.js).toMatch(/rt\.invariantGuard\(dateRange, \[\[0, \[\], "set", start_?\d*\], \[1, \[\], "set", end_?\d*\]\][^\n]*\n\s*rt\.batch\(/);
  }, 120000);
});

describe("a deep write and a genuine replace of a value of an invariant-bearing type", () => {
  const src = "type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]\n" + prog(`    let <r:Range=({ lo: 1, hi: 2 })/>
    \${ let seen: int = 0; }
    let <shown:int=0/>
    <effect deps=[@r]>\${ seen = seen + 1; }</effect>
    function deep(n: int) { @r.lo = n; }
    function whole(n: int) { @r = { lo: n, hi: 5 }; }
    <main><p id="lo">\${@r.lo}</p><p id="hi">\${@r.hi}</p><p id="n">\${@shown}</p>
    <button id="show" onclick=\${ @shown = seen; }>show</button>
    <button id="d1" onclick=deep(2)>d</button><button id="d9" onclick=deep(9)>d</button>
    <button id="w3" onclick=whole(3)>w</button><button id="w9" onclick=whole(9)>w</button></main>`);

  test("a deep write that keeps it passes", async () => {
    expect((await run(await result(src), ["lo", "hi"], ["#d1"])).texts).toEqual(["2", "2"]);
  }, 120000);

  test("a deep write that breaks it traps: the enclosing value's invariant, nothing written, nothing notified", async () => {
    const r = await result(src);
    const before = await run(r, ["n"], ["#show"]);
    const ok = await run(r, ["n"], ["#d1", "#show"]);
    expect(Number(ok.texts[0])).toBeGreaterThan(Number(before.texts[0]));   // a kept write notifies the effect
    const o = await run(r, ["lo", "hi", "n"], ["#d9", "#show"]);
    expect(o.texts).toEqual(["1", "2", before.texts[0]]);
    expect(o.traps[0]).toContain("[rng] of type Range");
    expect(o.traps[0]).toContain("lo = 9, hi = 2");
  }, 120000);

  test("a genuine replace is checked: passes, and traps", async () => {
    const r = await result(src);
    expect((await run(r, ["lo", "hi"], ["#w3"])).texts).toEqual(["3", "5"]);
    const o = await run(r, ["lo", "hi"], ["#w9"]);
    expect(o.texts).toEqual(["1", "2"]);
    expect(o.traps[0]).toContain("lo = 9, hi = 5");
  }, 120000);

  test("a literal replace that breaks it is the compile-time E-WRITE-INVARIANT; a literal deep write that decides it too", async () => {
    const r = await result("type Range:struct = { lo: int, hi: int } invariant (lo <= hi)\n" + prog(`    let <r:Range=({ lo: 1, hi: 2 })/>
    function whole() { @r = { lo: 9, hi: 5 }; }
    <main><button onclick=whole()>\${@r.lo}</button></main>`));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    const r2 = await result("type Pos:struct = { x: int, y: int } invariant (x >= 0)\n" + prog(`    let <p:Pos=({ x: 1, y: 2 })/>
    function left() { @p.x = -1; }
    <main><button onclick=left()>\${@p.x}</button></main>`));
    expect(codes(r2)).toEqual(["E-WRITE-INVARIANT"]);
  }, 120000);
});

describe("a local value of the type, and construction", () => {
  const src = "type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]\n" + prog(`    let <r:Range=({ lo: 1, hi: 2 })/>
    let <msg:string=""/>
    fn mk(a: int, b: int) -> Range { return { lo: a, hi: b }; }
    function loc(n: int) { let x: Range = { lo: 1, hi: 2 }; x.lo = n; @r = x; }
    function built(a: int, b: int) { @msg = "before"; const v: Range = mk(a, b); @msg = "built"; }
    <main><p id="lo">\${@r.lo}</p><p id="m">\${@msg}</p>
    <button id="l0" onclick=loc(0)>l</button><button id="l9" onclick=loc(9)>l</button>
    <button id="b1" onclick=built(1, 2)>b</button><button id="b9" onclick=built(9, 2)>b</button></main>`);

  test("a local's part write is checked on the local's candidate: passes, traps (the local and the cell unchanged)", async () => {
    const r = await result(src);
    expect((await run(r, ["lo"], ["#l0"])).texts).toEqual(["0"]);
    const o = await run(r, ["lo"], ["#l9"]);
    expect(o.texts).toEqual(["1"]);
    expect(o.traps[0]).toContain("lo = 9, hi = 2");
  }, 120000);

  test("a construction `{ … }` of the type is checked where it is built: the handler stops at it", async () => {
    const r = await result(src);
    expect((await run(r, ["m"], ["#b1"])).texts).toEqual(["built"]);
    const o = await run(r, ["m"], ["#b9"]);
    expect(o.texts).toEqual(["before"]);
    expect(o.traps[0]).toContain("[rng] of type Range");
  }, 120000);

  test("an all-literal construction the invariants prove has no run-time check", async () => {
    const r = await result(src);
    expect(r.client.js).toContain("let x = { lo: 1, hi: 2 };");
  }, 120000);
});

describe("`reset`, tape edits, and a declaration's construction", () => {
  test("reset: the reset value is checked against the other fields' current values", async () => {
    const r = await result(prog(`    <band:struct>
        let <low:int=6/>
        let <high:int=9/>
    </>
    invariant (low <= high)
    function lower() { @band = { ...@band, low: 1, high: 3 }; }
    function back() { reset(@band.low); }
    <main><p id="l">\${@band.low}</p><button id="lo" onclick=lower()>x</button><button id="rs" onclick=back()>r</button></main>`));
    const o = await run(r, ["l"], ["#lo", "#rs"]);
    expect(o.texts).toEqual(["1"]);
    expect(o.traps[0]).toContain("low = 6, high = 3");
  }, 120000);

  test("an append to a tape an invariant reads: passes, then traps at the bound it states", async () => {
    const r = await result(prog(`    <bag:struct>
        <tags:string[free, replace]=([])/>
    </>
    invariant (tags.length <= 2) [fewTags]
    renders <span>\${tags.length}</span>
    function add() { @bag.tags.append("a"); }
    <main><p id="n">\${@bag.tags.length}</p><button id="a" onclick=add()>a</button></main>`));
    const o = await run(r, ["n"], ["#a", "#a", "#a"]);
    expect(o.texts).toEqual(["2"]);
    expect(o.traps.length).toBe(1);
    expect(o.traps[0]).toContain("[fewTags]");
  }, 120000);

  test("a declaration's construction is checked once its fields are seeded (a non-literal default)", async () => {
    const r = await result(prog(`    \${ fn twelve() -> int { return 12; } }
    <dateRange:struct>
        let <start:int=(twelve())/>
        let <end:int=10/>
    </>
    invariant (start <= end) [ordered]
    <main><p id="s">\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual([]);
    // the check stands in the factory, after the seeded fields (the trap itself is pinned in Chromium —
    // a trap raised while the page is built escapes happy-dom's harness)
    expect(r.client.js).toMatch(/inst\$\.fields\[1 \/\* end \*\/\] = rt\.seeded\([^\n]*\n\s*rt\.invariantGuard\(inst\$, \[\], \[\[\[\], \(start, end\) => start <= end/);
  }, 120000);
});

describe("evaluation order (§66.13.5): the field's own contract before the invariants", () => {
  test("a lone graph write whose edge is refused traps on the edge (E-ENGINE-INVALID-TRANSITION), not the invariant", async () => {
    const r = await result(prog(`    type Status:enum = { Placed, Packed, Shipped }
    <order:struct>
        let <tracking:string | not=not/>
        <status:Status=.Placed>
            <Placed rule=.Packed/>
            <Packed rule=.Shipped/>
            <Shipped/>
        </>
    </>
    invariant (status != .Shipped || tracking is given) [shippedHasTracking]
    function go(s: Status) { @order.status = s; }
    <main><p id="s">\${@order.status}</p><button id="x" onclick=go(.Shipped)>x</button></main>`));
    expect(codes(r)).toEqual([]);
    // the edge check is handed to the guard to run first (rt.edgeFirst); the transition re-checks it. The
    // run-time order is pinned in Chromium (the edge refusal is a plain Error happy-dom's harness re-raises).
    expect(r.client.js).toMatch(/rt\.transition\([^\n]*rt\.invariantGuard\([^\n]*\[shippedHasTracking\][^\n]*rt\.edgeFirst\(/);
  }, 120000);
});

describe("compile-time constants (ruling S483-invariant-const-read)", () => {
  test("a compile-time constant read directly and through a `fn` chain compiles (probes h03, d16) and is checked at run time", async () => {
    const r = await result(prog(`    \${ const MAX_NIGHTS = 14;
       const LIMIT = MAX_NIGHTS;
       fn fits(a: int, b: int) -> bool { return b - a <= LIMIT; } }
${RANGE}
    invariant (end - start <= MAX_NIGHTS) [maxNights]
    invariant (fits(start, end))
    function setEnd(n: int) { @dateRange.end = n; }
    <main><p id="e">\${@dateRange.end}</p><button id="ok" onclick=setEnd(14)>ok</button><button id="bad" onclick=setEnd(30)>bad</button></main>`));
    expect(codes(r)).toEqual([]);
    expect((await run(r, ["e"], ["#ok"])).texts).toEqual(["14"]);
    const o = await run(r, ["e"], ["#bad"]);
    expect(o.texts).toEqual(["10"]);
    expect(o.traps[0]).toContain("[maxNights]");
  }, 120000);

  test("a constant decides the invariant at compile time with the literals: E-WRITE-INVARIANT", async () => {
    const r = await result(prog(`    \${ const MAX = 5; }
    <counter:struct>
        let <n:int=0/>
    </>
    invariant (n <= MAX)
    function up() { @counter.n = 9; }
    <main><button onclick=up()>\${@counter.n}</button></main>`));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
  }, 120000);

  test("a `let`, a non-constant initializer: refused (E-DECL-INVARIANT-IMPURE)", async () => {
    const r1 = await result(prog(`    \${ let lim = 3; function bump() { lim = lim + 1; } }\n${RANGE}\n    invariant (end - start <= lim)\n    <main><button onclick=bump()>\${@dateRange.start}</button></main>`));
    expect(codes(r1)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r1)[0].message).toContain("mutable");
    const r2 = await result(prog(`    \${ fn three() -> int { return 3; } const LIM = three(); }\n${RANGE}\n    invariant (end - start <= LIM)\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r2)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r2)[0].message).toContain("not a compile-time constant");
  }, 120000);

  test("a constant server code reads stays refused; without the invariant its value stays out of the client", async () => {
    const SRC = (inv) => prog(`    \${
        const SECRET_TAG = "zz-sk-live-777";
        function tagged() {
            ?{\`DELETE FROM tags WHERE name = \${SECRET_TAG}\`}.run() !{ _ :> return };
        }
    }
    <tok:struct>
        let <v:string=""/>
    </>
${inv}
    <main><p>\${@tok.v}</p><button onclick={ tagged() !{ .Transport(_) :> return }; }>t</button><button onclick={ @tok.v = @tok.v + "!"; }>w</button></main>`).replace("<program>", '<program db="sqlite:./tags.db">');
    const r = await result(SRC("    invariant (v != SECRET_TAG)"));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toContain("`SECRET_TAG` (only server code reads it");
    // the same program without the clause: the constant is server-only — in the server artifact, not the client's
    const r2 = await result(SRC(""));
    expect(codes(r2)).toEqual([]);
    expect(r2.client.js).not.toContain("zz-sk-live-777");
    expect(JSON.stringify(r2)).toContain("zz-sk-live-777");
  }, 120000);
});

describe("writes the run-time check does not name yet: refused, never unchecked (INTERIM)", () => {
  test("a position write into a tape an invariant reads", async () => {
    const r = await result(prog(`    <bag:struct>
        <tags:string[write]=(["a", "b"])/>
    </>
    invariant (tags.every(t => t != ""))
    renders <span>\${tags.length}</span>
    function clear() { @bag.tags[0] = ""; }
    <main><button onclick=clear()>\${@bag.tags.length}</button></main>`));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("g-boot-invariant-position-writes-s483");
  }, 120000);

  test("a `bind:value` to a field an invariant reads (lane 3 builds the refusal-with-keep)", async () => {
    const r = await result(prog(`    <person:struct>
        let <name:string="a"/>
    </>
    invariant (name != "")
    <main><input bind:value=@person.name/></main>`));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("W-BIND-INVARIANT-FIELD");
  }, 120000);
});
