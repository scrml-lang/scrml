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
 * Positions: the `if` among the row's ROOTS (the row is lowered as the plain loop the block re-runs)
 * and the `if` inside an ELEMENT of the row (a region of the keyed row: its own tracked effect re-runs
 * the `if` in a child owner scope; the row keeps its keying — the typed-input test pins that).
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

describe("an if inside a row ELEMENT keeps the row keyed", () => {
  test("typed input text survives revoke, re-grant, an in-place write and a reorder", async () => {
    const app = compileAndMount(`<role> = "admin"
<xs> = [{ id: 1, ok: true }, { id: 2, ok: true }]
<div id="out">\${ for (r of @xs) { lift <li data-id=\${r.id}><input class="in"/>\${ if (@role == "admin" && r.ok) { lift <b class="g">x</b> } }</li> } }</div>
`);
    expect(app.errors).toEqual([]);
    expect(app.clientJs).toMatch(/_scrml_reconcile_list\(/);
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
    expect(input(2)).toBe(typed);
    expect(input(2).value).toBe("typed by the user");
    expect(document.querySelector("#out li").getAttribute("data-id")).toBe("2");
  });
});

describe("the region re-runs only when what it reads changes", () => {
  test("an input the arm lifts keeps its node and typed text across a reorder and another row's in-place write", async () => {
    const app = compileAndMount(`<xs> = [{ id: 1, ok: true }, { id: 2, ok: true }]
<div id="out">\${ for (r of @xs) { lift <li data-id=\${r.id}>\${ if (r.ok) { lift <input class="g"/> } }</li> } }</div>
`);
    expect(app.errors).toEqual([]);
    await flush();
    const inArm = () => document.querySelector('#out li[data-id="1"] input.g');
    const typed = inArm();
    typed.value = "typed by the user";
    globalThis.__kri_set("xs", globalThis.__kri_deep([...globalThis.__kri_get("xs")].reverse())); await flush();
    expect(inArm()).toBe(typed);
    globalThis.__kri_get("xs")[0].ok = false; await flush(); // row 2 (now first) revoked in place
    expect(document.querySelector('#out li[data-id="2"] input.g')).toBeNull();
    expect(inArm()).toBe(typed);
    expect(inArm().value).toBe("typed by the user");
    // Row 1 revoked: the arm's input leaves; re-granted: it is built again.
    globalThis.__kri_get("xs")[1].ok = false; await flush();
    expect(inArm()).toBeNull();
    globalThis.__kri_get("xs")[1].ok = true; await flush();
    expect(inArm()).not.toBeNull();
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
