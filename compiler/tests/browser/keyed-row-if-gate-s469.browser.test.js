/**
 * keyed-row-if-gate-s469 — EXECUTES the emitted client JS for a control-flow `if` inside a keyed
 * (reconciled) `for … lift` row (g-keyed-row-control-flow-if-not-reevaluated-s469, HIGH, security).
 *
 * Main evaluated the `if` once, when the row was built: `for (r of @xs) { if (r.ok) { lift <b/> } }`
 * kept `<b>` after a same-key replace with `ok: false` and after an in-place write, and
 * `if (@role == "admin") { lift … }` kept both rows' `<b>` after `@role` was revoked.
 *
 * Each case is mounted and driven through one script of SEPARATE steps (every step is its own
 * flushed write, i.e. its own handler run): revoke → re-grant → same-key replace → in-place write →
 * reorder → revoke and reorder in separate runs → remove + re-add → clear → refill. After EVERY step
 * the page must show exactly what the conditions say for the current state (the floor: gated content
 * is never visible while its condition is false), in row order.
 *
 * Positions: the `if` among the row's ROOTS and the `if` inside an ELEMENT of the row. Either way the
 * row is lowered as the plain loop the block re-runs (S469 round 2 removed a region for the element
 * form); the keying cost is pinned below. Also the nested-loop region's range ownership (HIGH-1 of the
 * review of b84c3f6de) and the bind / untracked regression (MED-1).
 */

import { describe, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { resolve } from "path";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";
import { captureInsideChunkScope } from "../helpers/chunk-scope.js";
import { tmpdir } from "os";

if (!globalThis.document) GlobalRegistrator.register();

const tmpRoot = resolve(tmpdir(), "scrml-keyed-row-if-gate-s469");

function compileAndMount(source) {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const tmpDir = resolve(tmpRoot, `case-${uniq}`);
  const outDir = resolve(tmpDir, "out");
  mkdirSync(tmpDir, { recursive: true });
  const tmpInput = resolve(tmpDir, "app.scrml");
  writeFileSync(tmpInput, source);
  const result = compileScrml({ inputFiles: [tmpInput], write: true, outputDir: outDir, log: () => {} });
  const errors = (result.errors ?? [])
    .filter((e) => (e.severity ?? "error") === "error" && !/^[WI]-/.test(e.code ?? ""))
    .map((e) => e.code);
  if (errors.length > 0) return { errors, clientJs: "" };
  const html = readFileSync(resolve(outDir, "app.html"), "utf8");
  const clientJs = readFileSync(resolve(outDir, "app.client.js"), "utf8");
  const runtimeJs = readFileSync(resolve(outDir, result.runtimeFilename ?? "scrml-runtime.js"), "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  new Function(
    "window",
    "document",
    `${runtimeJs}\n` + captureInsideChunkScope(
      clientJs,
      `globalThis.__kri_set = typeof _scrml_cs_reactive_set === "function" ? _scrml_cs_reactive_set : _scrml_reactive_set;\n` +
      `globalThis.__kri_get = typeof _scrml_cs_reactive_get === "function" ? _scrml_cs_reactive_get : _scrml_reactive_get;\n` +
      `globalThis.__kri_deep = _scrml_deep_reactive;\n`,
    ),
  )(window, document);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  return { errors, clientJs };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const row = (id, ok) => ({ id, ok, tags: ["a", "b"] });
const setRows = (rows) => globalThis.__kri_set("xs", globalThis.__kri_deep(rows.map((r) => ({ ...r, tags: [...r.tags] }))));
const live = () => globalThis.__kri_get("xs");
const plain = () => [...live()].map((r) => ({ id: r.id, ok: r.ok, tags: [...r.tags] }));

/** The step script: every entry is one handler run (one flushed write). */
const STEPS = [
  ["revoke @role", () => globalThis.__kri_set("role", "user")],
  ["re-grant @role", () => globalThis.__kri_set("role", "admin")],
  ["same-key replace id 1 with ok: false", () => setRows(plain().map((r) => (r.id === 1 ? { ...r, ok: false } : r)))],
  ["in-place write id 2 ok = false", () => { live()[1].ok = false; }],
  ["in-place write id 1 ok = true", () => { live()[0].ok = true; }],
  ["reorder (reverse)", () => setRows(plain().reverse())],
  ["revoke @role (before a reorder)", () => globalThis.__kri_set("role", "user")],
  ["reorder after the revoke (separate run)", () => setRows(plain().reverse())],
  ["re-grant @role after the reorder", () => globalThis.__kri_set("role", "admin")],
  ["in-place write the first row ok = false", () => { live()[0].ok = false; }],
  ["reorder after the in-place write (separate run)", () => setRows(plain().reverse())],
  ["remove id 1", () => setRows(plain().filter((r) => r.id !== 1))],
  ["re-add id 1 (ok) at the front", () => setRows([row(1, true), ...plain()])],
  ["clear", () => setRows([])],
  ["refill", () => setRows([row(1, true), row(2, false), row(3, true)])],
  ["in-place write id 2 ok = true", () => { live()[1].ok = true; }],
  ["revoke @role", () => globalThis.__kri_set("role", "user")],
  ["reorder (rotate) while revoked", () => { const p = plain(); setRows([...p.slice(1), p[0]]); }],
  ["re-grant @role", () => globalThis.__kri_set("role", "admin")],
];

const PAGE = (body) => `<role> = "admin"
<xs> = [{ id: 1, ok: true, tags: ["a", "b"] }, { id: 2, ok: true, tags: ["a", "b"] }]
<p class="pre">before</p>
<div id="out">\${ for (r of @xs) { ${body} } }</div>
<p class="post">after</p>
`;

/** What the page must show: per row, in order, the classes of the gated elements present. */
async function runScript(app, want) {
  expect(app.errors).toEqual([]);
  await flush();
  const check = (label) => {
    const rows = [...live()];
    const role = globalThis.__kri_get("role");
    const expected = rows.map((r) => want(r, role)).flat().join(" ");
    const got = [...document.querySelectorAll("#out .k")].map((e) => e.getAttribute("data-k")).join(" ");
    expect(`${label}: ${got}`).toBe(`${label}: ${expected}`);
    expect(document.querySelectorAll("p.pre").length).toBe(1);
    expect(document.querySelectorAll("p.post").length).toBe(1);
  };
  check("mount");
  for (const [label, step] of STEPS) {
    step();
    await flush();
    check(label);
  }
}

// Each gated element carries `class="k"` and `data-k` naming what it is (with the row id where the
// row's own field decides it), so the assertion reads the visible set in document order.
const K = (name, id = true) => `<b class="k" data-k="${name}${id ? "${r.id}" : ""}">x</b>`;
const admin = (role) => role === "admin";

const CASES = [
  // ---- the `if` among the row's roots (lowered plain) ----
  ["root: if (r.ok), the row's only root", `if (r.ok) { lift ${K("g")} }`,
    (r) => (r.ok ? [`g${r.id}`] : [])],
  ["root: if (@role == \"admin\")", `if (@role == "admin") { lift ${K("g")} }`,
    (r, role) => (admin(role) ? [`g${r.id}`] : [])],
  ["root: if / else", `if (r.ok) { lift ${K("g")} } else { lift ${K("n")} }`,
    (r) => [r.ok ? `g${r.id}` : `n${r.id}`]],
  ["root: else if", `if (r.ok && @role == "admin") { lift ${K("g")} } else if (r.ok) { lift ${K("u")} } else { lift ${K("n")} }`,
    (r, role) => [r.ok && admin(role) ? `g${r.id}` : r.ok ? `u${r.id}` : `n${r.id}`]],
  ["root: nested if", `if (r.ok) { if (@role == "admin") { lift ${K("g")} } }`,
    (r, role) => (r.ok && admin(role) ? [`g${r.id}`] : [])],
  ["root: if around a nested loop", `if (r.ok) { for (t of r.tags) { lift <b class="k" data-k="\${t}\${r.id}">x</b> } }`,
    (r) => (r.ok ? r.tags.map((t) => `${t}${r.id}`) : [])],
  ["root: multi-root row (markup root, then the if)", `lift ${K("h")}\n if (@role == "admin" && r.ok) { lift ${K("g")} }`,
    (r, role) => [`h${r.id}`, ...(admin(role) && r.ok ? [`g${r.id}`] : [])]],
  ["root: multi-root row (the if, then a markup root)", `if (r.ok) { lift ${K("g")} }\n lift ${K("h")}`,
    (r) => [...(r.ok ? [`g${r.id}`] : []), `h${r.id}`]],
  ["root: if beside an element holding an if", `lift <i>\${ if (@role == "admin") { lift ${K("a")} } }</i>\n if (r.ok) { lift ${K("g")} }`,
    (r, role) => [...(admin(role) ? [`a${r.id}`] : []), ...(r.ok ? [`g${r.id}`] : [])]],
  // ---- the `if` inside an element of the row (a region; the row stays keyed) ----
  ["element: if (r.ok)", `lift <li>${K("h")}\${ if (r.ok) { lift ${K("g")} } }</li>`,
    (r) => [`h${r.id}`, ...(r.ok ? [`g${r.id}`] : [])]],
  ["element: if (@role == \"admin\")", `lift <li>\${ if (@role == "admin") { lift ${K("g")} } }</li>`,
    (r, role) => (admin(role) ? [`g${r.id}`] : [])],
  ["element: if / else", `lift <li>\${ if (r.ok) { lift ${K("g")} } else { lift ${K("n")} } }</li>`,
    (r) => [r.ok ? `g${r.id}` : `n${r.id}`]],
  ["element: else if", `lift <li>\${ if (r.ok && @role == "admin") { lift ${K("g")} } else if (r.ok) { lift ${K("u")} } else { lift ${K("n")} } }</li>`,
    (r, role) => [r.ok && admin(role) ? `g${r.id}` : r.ok ? `u${r.id}` : `n${r.id}`]],
  ["element: nested if", `lift <li>\${ if (r.ok) { if (@role == "admin") { lift ${K("g")} } } }</li>`,
    (r, role) => (r.ok && admin(role) ? [`g${r.id}`] : [])],
  ["element: if around a nested loop", `lift <li>\${ if (r.ok) { for (t of r.tags) { lift <b class="k" data-k="\${t}\${r.id}">x</b> } } }</li>`,
    (r) => (r.ok ? r.tags.map((t) => `${t}${r.id}`) : [])],
  ["element: between sibling elements (order kept)", `lift <li>${K("h")}\${ if (@role == "admin" && r.ok) { lift ${K("g")} } }${K("t")}</li>`,
    (r, role) => [`h${r.id}`, ...(admin(role) && r.ok ? [`g${r.id}`] : []), `t${r.id}`]],
  ["element: deep (li > div > p)", `lift <li><div><p>\${ if (r.ok) { lift ${K("g")} } }</p></div></li>`,
    (r) => (r.ok ? [`g${r.id}`] : [])],
  ["element: two ifs in one element", `lift <li>\${ if (r.ok) { lift ${K("g")} } }\${ if (@role == "admin") { lift ${K("a")} } }</li>`,
    (r, role) => [...(r.ok ? [`g${r.id}`] : []), ...(admin(role) ? [`a${r.id}`] : [])]],
  ["element: in one root of a multi-root row", `lift ${K("h")}\n lift <li>\${ if (r.ok) { lift ${K("g")} } }</li>`,
    (r) => [`h${r.id}`, ...(r.ok ? [`g${r.id}`] : [])]],
];

describe("a control-flow if in a keyed for … lift row is re-evaluated at every step", () => {
  for (const [name, body, want] of CASES) {
    test(name, async () => {
      const app = compileAndMount(PAGE(body));
      await runScript(app, want);
    });
  }
});

describe("index-keyed rows (no id)", () => {
  test("root: if (r.ok) without ids — in-place write and replace", async () => {
    const app = compileAndMount(`<xs> = [{ ok: true }, { ok: true }]
<div id="out">\${ for (r of @xs) { if (r.ok) { lift <b class="g">x</b> } } }</div>
`);
    expect(app.errors).toEqual([]);
    await flush();
    const n = () => document.querySelectorAll("#out b.g").length;
    expect(n()).toBe(2);
    globalThis.__kri_set("xs", globalThis.__kri_deep([{ ok: false }, { ok: true }])); await flush();
    expect(n()).toBe(1);
    globalThis.__kri_get("xs")[1].ok = false; await flush();
    expect(n()).toBe(0);
    globalThis.__kri_get("xs")[0].ok = true; await flush();
    expect(n()).toBe(1);
  });
  test("element: if (r.ok) without ids — in-place write and replace", async () => {
    const app = compileAndMount(`<xs> = [{ ok: true }, { ok: true }]
<div id="out">\${ for (r of @xs) { lift <li>\${ if (r.ok) { lift <b class="g">x</b> } }</li> } }</div>
`);
    expect(app.errors).toEqual([]);
    await flush();
    const n = () => document.querySelectorAll("#out b.g").length;
    expect(n()).toBe(2);
    globalThis.__kri_set("xs", globalThis.__kri_deep([{ ok: false }, { ok: true }])); await flush();
    expect(n()).toBe(1);
    globalThis.__kri_get("xs")[1].ok = false; await flush();
    expect(n()).toBe(0);
    globalThis.__kri_get("xs")[0].ok = true; await flush();
    expect(n()).toBe(1);
  });
});

describe("an if inside a row ELEMENT: the row is lowered plain too (the keying cost)", () => {
  // S469 round 2 (review of b84c3f6de): a region of the keyed row for an element-wrapped `if` was tried
  // and removed (three ways to leave revoked content visible). The row is the plain loop the block
  // re-runs: fresh at every step, but rebuilt on each change it reads — an unbound input in the row
  // loses its typed text (the cost; the corpus holds no element-wrapped `if`).
  test("fresh across revoke, re-grant, an in-place write and a reorder; the unbound input is rebuilt", async () => {
    const app = compileAndMount(`<role> = "admin"
<xs> = [{ id: 1, ok: true }, { id: 2, ok: true }]
<div id="out">\${ for (r of @xs) { lift <li data-id=\${r.id}><input class="in"/>\${ if (@role == "admin" && r.ok) { lift <b class="g">x</b> } }</li> } }</div>
`);
    expect(app.errors).toEqual([]);
    expect(app.clientJs).not.toMatch(/_scrml_reconcile_list\(/);
    expect(app.clientJs).not.toContain("scrml-region");
    await flush();
    const input = (id) => document.querySelector(`#out li[data-id="${id}"] input.in`);
    const gates = () => document.querySelectorAll("#out b.g").length;
    const typed = input(2);
    typed.value = "typed by the user";
    expect(gates()).toBe(2);
    globalThis.__kri_set("role", "user"); await flush();
    expect(gates()).toBe(0);
    globalThis.__kri_set("role", "admin"); await flush();
    expect(gates()).toBe(2);
    globalThis.__kri_get("xs")[1].ok = false; await flush();
    expect(gates()).toBe(1);
    globalThis.__kri_set("xs", globalThis.__kri_deep([...globalThis.__kri_get("xs")].map((r) => ({ id: r.id, ok: r.ok })).reverse())); await flush();
    expect(gates()).toBe(1);
    expect(document.querySelector("#out li").getAttribute("data-id")).toBe("2");
    // The keying cost, pinned so a change to it is seen: the row was rebuilt.
    expect(input(2)).not.toBe(typed);
  });
});

describe("the nested-loop REGION of a keyed row owns a range, not a snapshot (review of b84c3f6de, HIGH-1)", () => {
  // A region recorded the nodes its run built; a CLOSED gate inside it swaps its element in for its
  // placeholder after the run, so the snapshot held only the placeholder. The next run removed that,
  // disposed the gate's effect with the scope, and the element stayed in the page, visible for good
  // (main too, #1529's loop region). The region now removes everything between its two anchors.
  const PAGE = (role) => `<role> = "${role}"
<xs> = [{ id: 1, tags: ["a", "b"] }, { id: 2, tags: ["c"] }]
<div id="out">\${ for (r of @xs) { lift <li>\${ for (t of r.tags) { const lbl = t + r.id
 lift <i class="k" data-k="i\${lbl}" if=\${lbl != ""}>x</i>
 lift <b class="k" data-k="\${lbl}" if=\${@role == "admin"}>x</b> } }</li> } }</div>
`;
  const seen = () => [...document.querySelectorAll("#out .k")].map((e) => e.getAttribute("data-k")).join(" ");
  const tagsOf = (id) => globalThis.__kri_get("xs").find((r) => r.id === id);
  test("closed first: grant, reorder, shrink, regrow, empty + revoke, refill, remove, clear — no orphan, no duplicate", async () => {
    const app = compileAndMount(PAGE("user"));
    expect(app.errors).toEqual([]);
    expect(app.clientJs).toMatch(/_scrml_reconcile_list\(/);
    expect(app.clientJs).toContain('createComment("scrml-region")');
    await flush();
    const steps = [
      ["mount", () => {}, "ia1 ib1 ic2"],
      ["grant", () => globalThis.__kri_set("role", "admin"), "ia1 a1 ib1 b1 ic2 c2"],
      ["reorder", () => globalThis.__kri_set("xs", globalThis.__kri_deep([...globalThis.__kri_get("xs")].reverse())), "ic2 c2 ia1 a1 ib1 b1"],
      ["shrink", () => { tagsOf(1).tags = ["a"]; }, "ic2 c2 ia1 a1"],
      ["regrow", () => { tagsOf(1).tags = ["a", "b", "z"]; }, "ic2 c2 ia1 a1 ib1 b1 iz1 z1"],
      ["empty, then revoke", () => { tagsOf(1).tags = []; globalThis.__kri_set("role", "user"); }, "ic2"],
      ["re-grant", () => globalThis.__kri_set("role", "admin"), "ic2 c2"],
      ["refill", () => { tagsOf(1).tags = ["q"]; }, "ic2 c2 iq1 q1"],
      ["remove a row", () => globalThis.__kri_set("xs", globalThis.__kri_deep([...globalThis.__kri_get("xs")].filter((r) => r.id !== 2))), "iq1 q1"],
      ["clear", () => globalThis.__kri_set("xs", globalThis.__kri_deep([])), ""],
      ["refill the list", () => globalThis.__kri_set("xs", globalThis.__kri_deep([{ id: 1, tags: ["a"] }, { id: 2, tags: ["x", "y"] }])), "ia1 a1 ix2 x2 iy2 y2"],
      ["revoke", () => globalThis.__kri_set("role", "user"), "ia1 ix2 iy2"],
    ];
    for (const [label, step, want] of steps) {
      step();
      await flush();
      expect(`${label}: ${seen()}`).toBe(`${label}: ${want}`);
    }
  });
  test("the inner list emptied, then the role revoked in a separate run: nothing gated stays", async () => {
    const app = compileAndMount(PAGE("user"));
    expect(app.errors).toEqual([]);
    await flush();
    globalThis.__kri_set("role", "admin"); await flush();
    tagsOf(1).tags = []; await flush();
    tagsOf(2).tags = []; await flush();
    globalThis.__kri_set("role", "user"); await flush();
    expect(document.querySelectorAll("#out b").length).toBe(0);
    tagsOf(1).tags = ["n"]; await flush();
    expect(seen()).toBe("in1");
  });
});

describe("a row lowered plain keeps a bound input while the user types", () => {
  test("an inline edit row (if (@editingId == c.id) … else …): typing does not rebuild the list", async () => {
    const app = compileAndMount(`<contacts> = [{ id: 1, name: "a" }, { id: 2, name: "b" }]
<editingId> = 1
<editName> = ""
<div id="out">\${ for (c of @contacts) { if (@editingId == c.id) { lift <div class="ed" data-id=\${c.id}><input class="nm" bind:value=@editName/></div> } else { lift <div class="rd">\${c.name}</div> } } }</div>
`);
    expect(app.errors).toEqual([]);
    await flush();
    const input = document.querySelector("#out input.nm");
    for (const v of ["h", "he", "hel"]) {
      input.value = v;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await flush();
      expect(document.querySelector("#out input.nm")).toBe(input);
    }
    expect(globalThis.__kri_get("editName")).toBe("hel");
    globalThis.__kri_set("editingId", 2); await flush();
    expect(document.querySelector("#out .ed").getAttribute("data-id")).toBe("2");
    expect([...document.querySelectorAll("#out .rd")].map((e) => e.textContent)).toEqual(["a"]);
    expect(document.querySelector("#out input.nm").value).toBe("hel");
  });
});

describe("where the plain list is re-run, and where it is refused", () => {
  const four = async (app) => {
    expect(app.errors).toEqual([]);
    await flush();
    const n = () => document.querySelectorAll("#out b.g").length;
    const seq = [n()];
    globalThis.__kri_set("xs", globalThis.__kri_deep([{ id: 1, ok: false }, { id: 2, ok: true }])); await flush(); seq.push(n());
    globalThis.__kri_get("xs")[1].ok = false; await flush(); seq.push(n());
    globalThis.__kri_set("xs", globalThis.__kri_deep([{ id: 1, ok: true }, { id: 2, ok: true }, { id: 3, ok: true }])); await flush(); seq.push(n());
    expect(seq).toEqual([2, 1, 0, 3]);
  };
  const HEAD = `<xs> = [{ id: 1, ok: true }, { id: 2, ok: true }]\n`;
  test("the iterable read through a function: the block is made a re-render effect", async () => {
    await four(compileAndMount(HEAD + `\${ function vis() { return @xs } }\n<div id="out">\${ for (r of vis()) { if (r.ok) { lift <b class="g">x</b> } } }</div>\n`));
  });
  test("inside an `if … lift` arm: the arm re-renders", async () => {
    await four(compileAndMount(HEAD + `<show> = true\n<div id="out">\${ if (@show) { for (r of @xs) { if (r.ok) { lift <b class="g">x</b> } } } }</div>\n`));
  });
  test("a `match` statement in the row: the row is lowered plain", async () => {
    await four(compileAndMount(HEAD + `<div id="out">\${ for (r of @xs) { match r.ok { true => { lift <b class="g">x</b> } false => { lift <i>n</i> } } } }</div>\n`));
  });
  test("a `match` on a cell in the row: revoked", async () => {
    const app = compileAndMount(`type R:enum = { Admin, User }
<role>: R = .Admin
<xs> = [{ id: 1 }, { id: 2 }]
<div id="out">\${ for (r of @xs) { match @role { .Admin => { lift <b class="g">x</b> } .User => { lift <i class="u">n</i> } } } }</div>
`);
    expect(app.errors).toEqual([]);
    await flush();
    const n = () => [document.querySelectorAll("#out b.g").length, document.querySelectorAll("#out i.u").length];
    expect(n()).toEqual([2, 0]);
    globalThis.__kri_set("role", "User"); await flush();
    expect(n()).toEqual([0, 2]);
    globalThis.__kri_set("role", "Admin"); await flush();
    expect(n()).toEqual([2, 0]);
  });
  test("markup built in a function body: no render re-runs the list — refused (fail closed)", () => {
    const app = compileAndMount(HEAD + `\${ function list() { return <ul>\${ for (r of @xs) { if (r.ok) { lift <li class="g">x</li> } } }</ul> } }\n<div id="out">\${ list() }</div>\n`);
    expect(app.errors).toContain("E-IMPL1-LIFT-GATE-UNTRACKED");
  });
});

describe("a bind inside a keyed row does not subscribe the render around the list (review of b84c3f6de, MED-1)", () => {
  // `_scrml_untracked` restored `false` instead of the prior pause state, so the first row's bind init
  // (run inside `_scrml_reconcile_list`'s paused window) turned tracking back on and the later rows'
  // reads subscribed the enclosing `if … lift` arm: an in-place write or an append re-rendered the arm
  // and a sibling input lost its typed text (the todomvc shape).
  for (const [label, step] of [
    ["an in-place write of a row's field", () => { globalThis.__kri_get("xs")[1].id = 7; }],
    ["an append", () => { globalThis.__kri_get("xs").push({ id: 3, n: "r" }); }],
  ]) {
    test(`${label}: the arm and its sibling input are kept`, async () => {
      const app = compileAndMount(`<x> = "a"
<show> = true
<xs> = [{ id: 1, n: "p" }, { id: 2, n: "q" }]
<div id="out">\${ if (@show) { lift <input class="top"/>
 for (r of @xs) { lift <li><input class="in" bind:value=@x/>\${r.n}</li> } } }</div>
`);
      expect(app.errors).toEqual([]);
      await flush();
      const top = document.querySelector("#out input.top");
      top.value = "typed by the user";
      step();
      await flush();
      expect(document.querySelector("#out input.top")).toBe(top);
      expect(top.value).toBe("typed by the user");
    });
  }
});
