// loop-key-s474.test.js — s474: the loop-header `key` (SPEC §17.4b, §49.2.1
// `key-clause ::= 'key' expression`), ruled canonical S473 (user-voice "⭐ RULED —
// S473 review-surfaced decisions" item 5: "the loop-header `key` is the canonical
// keyed-iteration form (§17.4b) … W-KEY-001 takes the header meaning").
//
//   1. parse + compile: `${ for (const x of xs key x.id) { lift <li/>; } }` in
//      markup prints `rt.gatherKeyed` with one `rt.loopKey(…)` per iteration;
//   2. RUNTIME — keyed reconciliation (§17.4b: "elements are matched by key
//      identity across updates, preserving DOM state (focus, animation, scroll
//      position) for elements whose key persists"): on a reorder each surviving
//      row keeps its DOM node (identity, an input's typed text, focus) and takes
//      its item's new values; a new key renders; a key that left is removed;
//      a key two iterations share is a runtime trap;
//   3. W-KEY-001 (the header meaning): a markup loop over a tape of structs
//      with no `key`; not for primitives, not when keyed;
//   4. E-KEY-001: a key that is not a string or a number;
//   5. a `key` on a loop that renders no rows (a statement loop, a loop bound
//      as a value) is refused by name (E-BOOTSTRAP-UNSUPPORTED).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => [...new Set(run(src).diags.map((d) => d.code))].sort();
const diag = (src, code) => run(src).diags.find((d) => d.code === code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s474key-" + k++, []);
const js = (src) => mods.print.printProgram(clean(src).core, "t.client.js", "scrml-runtime.js").js;

// `items` starts a, b, c; "rot" rotates to c, a, b and renames c to C; "drop" leaves b, d
const ITEMS = `    type Item:struct = { id: int, name: string }
    <items:Item[replace]=([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }])/>
    function rot() { @items = [{ id: 3, name: "C" }, { id: 1, name: "a" }, { id: 2, name: "b" }]; }
    function drop() { @items = [{ id: 2, name: "b" }, { id: 4, name: "d" }]; }
    function twin() { @items = [{ id: 1, name: "a" }, { id: 1, name: "z" }]; }`;
const prog = (decls, body) => `<program>\n${decls}\n    <main>\n${body}\n        <button onclick=rot()>rot</button>\n        <button onclick=drop()>drop</button>\n        <button onclick=twin()>twin</button>\n    </main>\n</program>\n`;
const lis = (sel) => [...document.querySelectorAll(sel + " > li")];

// ---------------------------------------------------------------------------
describe("1 — the header `key` parses and compiles to keyed reconciliation", () => {
  test("printed: `rt.gatherKeyed`, `rt.loopKey(it.id)` once per iteration, `rt.keyRow(…)` per lift", () => {
    const out = js(prog(ITEMS, `        <ul id="u">\${ for (const it of @items key it.id) { lift <li>\${it.name}</li>; } }</ul>`));
    expect(out).toContain("rt.gatherKeyed(");
    expect(out).toMatch(/const key\w* = rt\.loopKey\(it\w*\.id\);/);
    expect(out).toMatch(/rt\.keyRow\(key\w*, 0, \[it\w*\], \(scope\$, anchor\$, it\w*\) =>/);
    // the row's markup reads the loop local through its cell
    expect(out).toMatch(/it\w*\.get\(\)\.name/);
  });
  test("an unkeyed loop still prints `rt.gather` (positional)", () => {
    const out = js(prog(`    <xs:int[]=([1, 2])/>\n${ITEMS}`, `        <ul>\${ for (x of @xs) { lift <li>\${x}</li>; } }</ul>`));
    expect(out).toContain("rt.gather(");
    expect(out).not.toContain("rt.gatherKeyed(");
  });
  test("a range head takes a key too; so does a `let` binder", () => {
    clean(prog(ITEMS, `        <ul>\${ for (i of 0..3 key i) { lift <li>\${i}</li>; } }</ul>\n        <ol>\${ for (let it of @items key it.name) { lift <li>\${it.id}</li>; } }</ol>`));
  });
});

// ---------------------------------------------------------------------------
describe("2 — RUNTIME: keyed reconciliation preserves DOM identity", () => {
  test("a reorder MOVES the rows: each surviving key keeps its node; a changed field updates in place", async () => {
    await load(prog(ITEMS, `        <ul id="u">\${ for (const it of @items key it.id) { lift <li>\${it.name}</li>; } }</ul>`));
    const before = lis("#u");
    expect(before.map((e) => e.textContent)).toEqual(["a", "b", "c"]);
    click(btn("rot"));
    const after = lis("#u");
    expect(after.map((e) => e.textContent)).toEqual(["C", "a", "b"]);
    expect(after[0]).toBe(before[2]);   // key 3: the same node, its text updated
    expect(after[1]).toBe(before[0]);   // key 1
    expect(after[2]).toBe(before[1]);   // key 2
  });
  test("the unkeyed loop, the same reorder: every row is a NEW node (positional teardown)", async () => {
    // (W-KEY-001 fires on this program — loaded past the warning on purpose)
    const src = prog(ITEMS, `        <ul id="u">\${ for (const it of @items) { lift <li>\${it.name}</li>; } }</ul>`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["W-KEY-001"]);
    await loadProgram(r.core, "s474key-" + k++, []);
    const before = lis("#u");
    click(btn("rot"));
    const after = lis("#u");
    expect(after.map((e) => e.textContent)).toEqual(["C", "a", "b"]);
    for (const a of after) expect(before.includes(a)).toBe(false);
  });
  // (#1700 review F5: focus does NOT survive — moving a node blurs it; the node itself and its typed text do)
  test("DOM state follows the item: an input's NODE and typed text survive a reorder", async () => {
    await load(prog(ITEMS, `        <ul id="u">\${ for (const it of @items key it.id) { lift <li><input class="t"/>\${it.name}</li>; } }</ul>`));
    const inputs = [...document.querySelectorAll("#u input.t")];
    inputs[2].value = "typed into c";
    click(btn("rot"));
    const now = [...document.querySelectorAll("#u input.t")];
    expect(now[0]).toBe(inputs[2]);
    expect(now[0].value).toBe("typed into c");
    expect(lis("#u")[0].textContent).toBe("C");
  });
  test("a key that left is removed, a new key renders, a survivor keeps its node", async () => {
    await load(prog(ITEMS, `        <ul id="u">\${ for (const it of @items key it.id) { lift <li>\${it.name}</li>; } }</ul>`));
    const before = lis("#u");
    click(btn("drop"));
    const after = lis("#u");
    expect(after.map((e) => e.textContent)).toEqual(["b", "d"]);
    expect(after[0]).toBe(before[1]);
    expect(before.includes(after[1])).toBe(false);
    expect(before[0].isConnected).toBe(false);
    expect(before[2].isConnected).toBe(false);
  });
  test("several lifts per iteration: each keeps its node (identity = key + its place among the iteration's lifts)", async () => {
    await load(prog(ITEMS, `        <dl id="d">\${ for (const it of @items key it.id) { lift <dt>\${it.id}</dt>; lift <dd>\${it.name}</dd>; } }</dl>`));
    const before = [...document.querySelectorAll("#d > *")];
    expect(before.map((e) => e.textContent)).toEqual(["1", "a", "2", "b", "3", "c"]);
    click(btn("rot"));
    const after = [...document.querySelectorAll("#d > *")];
    expect(after.map((e) => e.textContent)).toEqual(["3", "C", "1", "a", "2", "b"]);
    expect(after[0]).toBe(before[4]);
    expect(after[1]).toBe(before[5]);
    expect(after[2]).toBe(before[0]);
  });
  test("a row that switches template under the same key is re-rendered, not reused", async () => {
    await load(prog(ITEMS, `        <ul id="u">\${ for (const it of @items key it.id) { if (it.name == "C") { lift <li class="big">\${it.name}</li>; } else { lift <li>\${it.name}</li>; } } }</ul>`));
    const before = lis("#u");
    click(btn("rot"));
    const after = lis("#u");
    expect(after.map((e) => e.textContent)).toEqual(["C", "a", "b"]);
    expect(after[0].className).toBe("big");
    expect(before.includes(after[0])).toBe(false);
    expect(after[1]).toBe(before[0]);
  });
  test("lifted VALUES in a keyed loop: text rows that move with their key", async () => {
    await load(prog(ITEMS, `        <p id="p">\${ for (const it of @items key it.id) { lift it.name; } }</p>`));
    expect($("#p").textContent).toBe("abc");
    click(btn("rot"));
    expect($("#p").textContent).toBe("Cab");
  });
  test("a key two iterations share is a runtime trap (§17.4b: unique within the collection)", async () => {
    await load(prog(ITEMS, `        <ul id="u">\${ for (const it of @items key it.id) { lift <li>\${it.name}</li>; } }</ul>`));
    const errs = [];
    const onErr = (e) => errs.push(e.error);
    window.addEventListener("error", onErr);
    btn("twin").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    window.removeEventListener("error", onErr);
    takePageErrors();      // drained: the trap is this test's expected page error
    expect(errs.length).toBe(1);
    expect(String(errs[0].message)).toContain("duplicate key 1");
  });
});

// ---------------------------------------------------------------------------
describe("3 — W-KEY-001 (the §17.4b header meaning)", () => {
  test("a markup loop over a tape of structs with no `key` — a Warning, at the iterable", () => {
    const d = diag(prog(ITEMS, `        <ul>\${ for (const it of @items) { lift <li>\${it.name}</li>; } }</ul>`), "W-KEY-001");
    expect(d).toBeTruthy();
    expect(d.severity).toBe("Warning");
    expect(d.message).toContain("key x.id");
  });
  test("near-misses: keyed; a tape of primitives; a loop that lifts only values", () => {
    expect(codes(prog(ITEMS, `        <ul>\${ for (const it of @items key it.id) { lift <li>\${it.name}</li>; } }</ul>`))).toEqual([]);
    expect(codes(prog(`    <xs:int[]=([1])/>\n${ITEMS}`, `        <ul>\${ for (x of @xs) { lift <li>\${x}</li>; } }</ul>`))).toEqual([]);
    expect(codes(prog(ITEMS, `        <p>\${ for (const it of @items) { lift it.name; } }</p>`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("4 — E-KEY-001: a key is a string or a number", () => {
  test("a struct key, a bool key, a `T | not` key", () => {
    expect(codes(prog(ITEMS, `        <ul>\${ for (const it of @items key it) { lift <li>\${it.name}</li>; } }</ul>`))).toEqual(["E-KEY-001"]);
    expect(codes(prog(ITEMS, `        <ul>\${ for (const it of @items key it.id > 1) { lift <li>\${it.name}</li>; } }</ul>`))).toEqual(["E-KEY-001"]);
  });
  test("an int, a string, a string expression: accepted", () => {
    expect(codes(prog(ITEMS, `        <ul>\${ for (const it of @items key it.name) { lift <li>\${it.name}</li>; } }</ul>`))).toEqual([]);
    expect(codes(prog(ITEMS, `        <ul>\${ for (const it of @items key it.name + "-") { lift <li>\${it.name}</li>; } }</ul>`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("5 — a `key` on a loop that renders no rows of its own is refused by name", () => {
  test("a statement loop; a loop bound as a value; a nested loop inside a markup loop", () => {
    const fnP = (b) => prog(`${ITEMS}\n    function f() -> int {\n${b}\n    }`, `        <p>\${f()}</p>`);
    const e1 = diag(fnP(`        let n = 0;\n        for (const it of @items key it.id) { n = n + it.id; }\n        return n;`), "E-BOOTSTRAP-UNSUPPORTED");
    expect(e1.message).toContain("header `key`");
    expect(codes(fnP(`        const ids = for (const it of @items key it.id) { lift it.id; };\n        return ids.length;`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(prog(ITEMS, `        <ul>\${ for (const it of @items key it.id) { for (i of 0..2 key i) { lift <li>\${i}</li>; } } }</ul>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// ---------------------------------------------------------------------------
// #1700 review round r1
describe("r1 — F3: a row's place is counted per template (a conditional lift of another template never shifts it)", () => {
  test("`if (it.name == \"C\") { lift <b>!</b>; } lift <li><input/>…</li>` — the c row's input keeps its node and text when c becomes C", async () => {
    await load(prog(ITEMS, `        <div id="d">\${ for (const it of @items key it.id) { if (it.name == "C") { lift <b>!</b>; } lift <li><input class="t"/>\${it.name}</li>; } }</div>`));
    const before = [...document.querySelectorAll("#d input.t")];
    before[2].value = "typed into c";
    click(btn("rot"));
    expect([...document.querySelectorAll("#d > *")].map((e) => e.tagName + ":" + e.textContent)).toEqual(["B:!", "LI:C", "LI:a", "LI:b"]);
    const now = [...document.querySelectorAll("#d input.t")];
    expect(now[0]).toBe(before[2]);
    expect(now[0].value).toBe("typed into c");
    expect(now[1]).toBe(before[0]);
  });
});

describe("r1 — F2: an unkeyed inner loop lifting markup inside a KEYED loop is refused by name", () => {
  const G = `    type Tag:struct = { id: int, n: string }
    type Grp:struct = { id: int, tags: Tag[replace] }
    <gs:Grp[replace]=([{ id: 1, tags: [{ id: 10, n: "x" }, { id: 11, n: "y" }] }])/>`;
  const P = (body) => `<program>\n${G}\n    <main>\n${body}\n    </main>\n</program>\n`;
  test("the reviewer's repro (typed text would move from x to y) — E-BOOTSTRAP-UNSUPPORTED naming the nested keyed list", () => {
    const e = run(P(`        <div>\${ for (const g of @gs key g.id) { for (const t of g.tags) { lift <label><input/>\${t.n}</label>; } } }</div>`)).diags.filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("nested keyed list");
  });
  test("also under an `if`; near-misses: the same loop unkeyed outside, an inner loop lifting only values, a nested Tier-0 inside a row", () => {
    expect(codes(P(`        <div>\${ for (const g of @gs key g.id) { if (g.id > 0) { for (const t of g.tags) { lift <i>\${t.n}</i>; } } } }</div>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P(`        <div>\${ for (const g of @gs) { for (const t of g.tags) { lift <i>\${t.n}</i>; } } }</div>`))).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(codes(P(`        <p>\${ for (const g of @gs key g.id) { for (const t of g.tags) { lift t.n; } } }</p>`))).toEqual([]);
    expect(codes(P(`        <div>\${ for (const g of @gs key g.id) { lift <section>\${ for (const t of g.tags key t.id) { lift <i>\${t.n}</i>; } }</section>; } }</div>`))).toEqual([]);
  });
});

describe("r1 — F7 / F8: diagnostic texts", () => {
  test("E-KEY-001 for a key that may be an int or a string names both (not \"not known\")", () => {
    const d = diag(prog(ITEMS, `        <ul>\${ for (const it of @items key it.id > 1 ? it.id : it.name) { lift <li>a</li>; } }</ul>`), "E-KEY-001");
    expect(d).toBeTruthy();
    expect(d.message).not.toContain("not known");
    expect(d.message).toContain("int");
    expect(d.message).toContain("string");
  });
  test("W-KEY-001 says an unkeyed loop REBUILDS its rows (state lost, not kept by position)", () => {
    const d = diag(prog(ITEMS, `        <ul>\${ for (const it of @items) { lift <li>\${it.name}</li>; } }</ul>`), "W-KEY-001");
    expect(d.message).toContain("REBUILDS");
    expect(d.message).not.toContain("stays with the position");
  });
});
