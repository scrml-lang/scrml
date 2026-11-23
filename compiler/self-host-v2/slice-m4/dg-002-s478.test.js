// dg-002-s478.test.js — s478 (PR #1871 review MED-1): E-DG-002 in the bootstrap.
//
// SPEC §34 (§31, §22.6), Severity Warning: "a reactive `@variable` is declared but never
// consumed — no reader edge in any render or logic context (`readers.size === 0`).
// Resolution: remove the unused cell, or prefix with `_` to suppress."
//
// Pins: it FIRES (as a Warning; the compile does not fail) for an unread cell and for a
// write-only one (a write is no reader edge), and it does NOT fire for a `_`-prefixed cell, an
// exported cell, a `persist=` cell, a `reset-on=` trigger, a `bind:` target, the `#{}` CSS
// bridge, a `<*f/>` state view, or a read in each main position — and it is not judged at all
// over a compile that has an Error (analyze.scrml analyzeRun: no cascade).
// Seeded from the review probes (~/.cache/scrml/review/s478-1871/probes/mk1..mk5.js).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const I = "$" + "{";
const P = (decls, main = `<p>x</p>`) => `<program>\n${decls}\n<main>${main}</main>\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const dg = (r) => r.diags.filter((d) => d.code === "E-DG-002");
const others = (r) => r.diags.filter((d) => d.code !== "E-DG-002").map((d) => `${d.code}: ${d.message}`);

/** E-DG-002 fires once per named cell, as a Warning, and the compile still succeeds. */
const fires = (src, names) => {
  const r = run(src);
  expect(others(r)).toEqual([]);
  const ds = dg(r);
  expect(ds.map((d) => d.severity)).toEqual(names.map(() => "Warning"));
  for (const n of names) expect(ds.some((d) => d.message.includes("`@" + n + "`"))).toBe(true);
  expect(r.diags.some((d) => d.severity === "Error")).toBe(false);
  expect(r.core).toBeTruthy();
};
/** No E-DG-002 — and nothing else either (the case is otherwise a clean program). */
const silent = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
};

describe("E-DG-002 fires (§34: no reader edge)", () => {
  test("an unread cell", () => fires(P(`let <n:int=0/>`), ["n"]));
  test("a write-only cell: `@n = 5` in a handler", () => fires(P(`let <n:int=0/>`, `<button onclick=@n = 5>x</button>`), ["n"]));
  test("a write-only cell: a function that only writes", () => fires(P(`let <n:int=0/>\nfunction go() { @n = 1; }`, `<button onclick=go()>x</button>`), ["n"]));
  test("a write-only cell: `reset(@n)`", () => fires(P(`let <n:int=0/>\nfunction go() { reset(@n); }`, `<button onclick=go()>x</button>`), ["n"]));
  test("a cell read only by an unread derived cell: the derived one warns, not its source", () => fires(P(`let <n:int=0/>\n<d=(@n * 2)/>`), ["d"]));
  test("the `_` exemption is a LEADING underscore only (`n_` still warns)", () => fires(P(`let <n_:int=0/>`), ["n_"]));
  test("one report per unread cell, and a read sibling is not reported", () => fires(P(`let <a:int=0/>\nlet <b:int=0/>\nlet <c:int=0/>`, `<p>${I}@b}</p>`), ["a", "c"]));
});

describe("E-DG-002 does not fire — exemptions", () => {
  test("a `_`-prefixed cell (§34: prefix with `_` to suppress)", () => silent(P(`let <_n:int=0/>`)));
  test("an exported cell (another file may read it)", () => silent(`<program>\nexport let <n:int=0/>\n<main><p>x</p></main>\n</program>\n`));
  test("a `persist=` cell (the stored copy reads it)", () => silent(P(`let <n:int=0 persist="local" key="app.n"/>`)));
  test("a `reset-on=[…]` trigger", () => silent(P(`let <q:string=""/>\nlet <n:int=0 reset-on=[@q]/>`, `<p>${I}@n}</p>`)));
  test("a `bind:value` / `bind:checked` target", () => {
    silent(P(`let <s:string=""/>`, `<input bind:value=@s/>`));
    silent(P(`let <b=false/>`, `<input type="checkbox" bind:checked=@b/>`));
  });
  test("a `@x` in a `#{}` stylesheet (the CSS bridge, §25.7)", () => silent(P(`let <c:string="red"/>\n#{ p { color: @c; } }`)));
  test("a `<*f/>` state view of an engine cell", () => silent(`<program>\n    type Phase:enum = { Idle, Done }\n    <phase:Phase=.Idle single>\n        <Idle rule=.Done : "idle">\n        <Done rule=.Idle : "Done">\n    </>\n    <main><p><*phase/></p></main>\n</program>\n`));
});

describe("E-DG-002 does not fire — a read in each main position", () => {
  test("interpolation", () => silent(P(`let <n:int=0/>`, `<p>${I}@n}</p>`)));
  test("an attribute", () => silent(P(`let <n:string="a"/>`, `<p title=@n>x</p>`)));
  test("`if=`", () => silent(P(`let <ok=true/>`, `<p if=@ok>x</p>`)));
  test("a handler (a read-and-write counts as a read)", () => silent(P(`let <n:int=0/>`, `<button onclick=@n = @n + 1>x</button>`)));
  test("a derived initializer", () => silent(P(`let <n:int=0/>\n<d=(@n * 2)/>`, `<p>${I}@d}</p>`)));
  test("a function body", () => silent(P(`let <n:int=0/>\nlet <m:int=0/>\nfunction go() { @m = @n + 1; }`, `<button onclick=go()>x</button><p>${I}@m}</p>`)));
  test("a function nobody calls (the read is still a reader edge)", () => silent(P(`let <n:int=0/>\nfunction f() -> int { return @n; }`)));
  test("an effect's `deps=`", () => silent(P(`let <n:int=0/>\nfunction note(x: int) { }`, `<button onclick=(@n = @n + 1)>x</button>\n<effect deps=[@n]>${I} note(1); }</>`)));
});

describe("E-DG-002 is not judged over a compile with an Error (no cascade)", () => {
  test("an unread cell beside an Error draws only the Error", () => {
    const r = run(P(`let <n:int=0/>`, `<p>${I}@nope}</p>`));
    expect(r.diags.some((d) => d.severity === "Error")).toBe(true);
    expect(dg(r)).toEqual([]);
  });
  test("the same unread cell without the Error does warn (the gate is what silenced it)", () => fires(P(`let <n:int=0/>`, `<p>x</p>`), ["n"]));
});
