// meta-runtime-s482.test.js — s482 (s482-meta-runtime): RUNTIME `^{}` blocks in the bootstrap
// (SPEC §22.5 / §22.12; gap g-boot-meta-runtime-unbuilt-s481, phase 2 of the S481 design read).
//
// Rulings: ruling:user-voice-scrml.md-S481-meta-four — item 2: `meta.get` / `meta.set` /
// `meta.subscribe` take LITERAL cell names, resolved at compile time; a computed name gets a
// "not supported yet" error (INTERIM); a literal naming no cell is E-SCOPE-001.
// PA defaults (S481 design read, INTERIM where they limit): Q7 a runtime block in an `<each>` row is
// E-META-001; Q8 the emitted shape is impl freedom, the scope id deterministic + document-unique;
// Q11 top-level runtime blocks run in source order with the body-top statements (probed vs impl#1).
//
// Pinned here (red on base — every runtime block was refused E-BOOTSTRAP-UNSUPPORTED there):
//   1. the compile: a runtime block is kept and printed (`rt.metaEffect` + its placeholder); the
//      literal-name rules; the refusals by name; E-DG-002 (§22.6); the scope id (§22.10);
//   2. the runtime (happy-dom, the bootstrap runtime module itself): impl#1's §22.12 gate copied
//      verbatim, judged with impl#1's own oracle lists (compiler/tests/unit/runtime-meta-emit-gate-
//      s458.test.js REFUSED / ADMITTED, read from that file); the page-form rule; the effect —
//      dependencies (`meta.get` only), re-run, own writes, cleanup / timer order, teardown;
//   3. the shipping path (scrml-boot compileSource + the conformance runner): a re-run on a cell
//      change, the teardown of a block in an `if=` region, the Q11 order probe;
//   4. Chromium (SCRML_BROWSER_TESTS=1): the DOM-clobbering refusals and a re-run in a real browser.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadM2, frontEnd } from "./harness.js";

const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");
const ORACLE = join(import.meta.dir, "..", "..", "tests", "unit", "runtime-meta-emit-gate-s458.test.js");

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const P = (body) => `<program>\n${body}\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => d.code);
const errMsgs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`);
const print = (r) => mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");

// ---------------------------------------------------------------------------
// 1. the compile
// ---------------------------------------------------------------------------
describe("s482 — a runtime `^{}` block compiles (§22.5)", () => {
  test("a block where markup stands is kept: a placeholder in the template, an rt.metaEffect in the render", () => {
    const r = run(P(`let <label:string="hi"/>\n<div id="host">^{ meta.emit("<p>" + meta.get("label") + "</p>"); }</div>`));
    expect(errMsgs(r)).toEqual([]);
    const out = print(r);
    expect(out.refused).toEqual([]);
    expect(out.html).toMatch(/<div id="host"><span data-scrml-meta="scrml_meta_app_002escrml_1"><\/span><\/div>/);
    expect(out.js).toContain(`rt.metaEffect(scope$, n$0_0, "scrml_meta_app_002escrml_1", (task$, meta$) => {`);
    // meta.get is the block's DEPENDENCY read: a thunk the runtime runs with tracking on
    expect(out.js).toContain("meta$.emit(\"<p>\" + meta$.get(() => inst$.fields[0 /* label */].get()) + \"</p>\")");
  });

  test("meta.set(\"x\", v); is a cell write; meta.scopeId is the block's id; meta.bindings reads the binding", () => {
    const r = run(P(`let <n:int=0/>\nconst app = "A";\n<p>\${@n}</p>\n<div>^{ meta.set("n", 2); meta.emit("<i>" + meta.scopeId + meta.bindings.app + "</i>"); }</div>`));
    expect(errMsgs(r)).toEqual([]);
    const js = print(r).js;
    expect(js).toContain("inst$.fields[0 /* n */].set(2);");
    expect(js).toContain(`"scrml_meta_app_002escrml_1"`);
  });

  test("a cell entry of meta.bindings is a dependency read, as meta.get (§22.5.2)", () => {
    const r = run(P(`let <c:int=1/>\n<div>^{ meta.emit(\`<p>\${meta.bindings.c}</p>\`); }</div>`));
    expect(errMsgs(r)).toEqual([]);
    expect(print(r).js).toContain("meta$.get(() => inst$.fields[0 /* c */].get())");
  });

  test("timers and cleanup: arrows of no parameters that may end without a return, calling the block's meta", () => {
    const r = run(P(`let <ms:int=10/>\n<div>^{\n  let id = meta.interval(meta.get("ms"), () => { meta.emit("<p>t</p>"); });\n  meta.cleanup(() => { meta.clearInterval(id); });\n  meta.timeout(5, () => { meta.emit("<p>once</p>"); });\n}</div>`));
    expect(errMsgs(r)).toEqual([]);
    const js = print(r).js;
    expect(js).toContain("meta$.interval(meta$.get(() => inst$.fields[0 /* ms */].get()), () => {");
    expect(js).toContain("meta$.cleanup(() => {");
    expect(js).toContain("meta$.clearInterval(id);");
  });

  test("the body's locals are the run's own (a bare block), never file-scope", () => {
    const r = run(P(`<div>^{ const x = "<p>a</p>"; meta.emit(x); }</div>\n<p>\${x}</p>`));
    expect(errs(r)).toEqual(["E-SCOPE-001"]);
  });

  test("§22.10 — the scope id is deterministic and unique: blocks in order, the file path spelled injectively", () => {
    const src = P(`<div>^{ meta.emit("a"); }</div><div>^{ meta.emit("b"); }</div>`);
    const a = print(run(src)).html;
    expect(a).toBe(print(run(src)).html);
    expect(a).toContain(`data-scrml-meta="scrml_meta_app_002escrml_1"`);
    expect(a).toContain(`data-scrml-meta="scrml_meta_app_002escrml_2"`);
    const r2 = frontEnd(mods, [{ path: "a_b.scrml", src }]);
    expect(print(r2).html).toContain(`data-scrml-meta="scrml_meta_a_005fb_002escrml_1"`);
  });

  test("s482 r1 (LOW-2): the escape is fixed-width — the review's colliding paths spell distinct ids", () => {
    const src = P(`<div>^{ meta.emit("<b>x</b>"); }</div>`);
    const id = (path) => print(frontEnd(mods, [{ path, src }])).html.match(/data-scrml-meta="([^"]*)"/)[1];
    // variable-width hex spelled both pairs alike (scrml_meta_a_5f5f_2escrml_1, scrml_meta__fcc_2escrml_1)
    expect([id("a_5f.scrml"), id("a\u5f5f.scrml")]).toEqual(["scrml_meta_a_005f5f_002escrml_1", "scrml_meta_a_5f5f_002escrml_1"]);
    expect([id("\u00fcc.scrml"), id("\u0fcc.scrml")]).toEqual(["scrml_meta__00fcc_002escrml_1", "scrml_meta__0fcc_002escrml_1"]);
    expect(id("a_5f.scrml")).toBe(id("a_5f.scrml"));                // deterministic
  });

  test("§22.6 — a cell read only inside a runtime block is consumed (no E-DG-002)", () => {
    const r = run(P(`let <seen:string="x"/>\n<div>^{ meta.emit(meta.get("seen")); }</div>`));
    expect(r.diags.filter((d) => d.code === "E-DG-002")).toEqual([]);
    expect(errMsgs(r)).toEqual([]);
  });
});

describe("s482 — literal names (ruling S481-meta-four item 2)", () => {
  test("a computed name is refused as not supported yet (INTERIM)", () => {
    const r = run(P(`let <label:string="hi"/>\nconst k = "label";\n<div>^{ meta.emit(meta.get(k)); }</div>`));
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("computed cell name is not supported yet");
  });
  test("a literal naming no cell is E-SCOPE-001 (meta.get and meta.set)", () => {
    expect(errs(run(P(`<div>^{ meta.emit(meta.get("nosuch")); }</div>`)))).toEqual(["E-SCOPE-001"]);
    expect(errs(run(P(`<div>^{ meta.set("nosuch", 1); }</div>`)))).toEqual(["E-SCOPE-001"]);
  });
  test("meta.get is typed as the cell (a string + int concatenation is E-OPERATOR-OPERAND-TYPE, S440 Gotcha Q1)", () => {
    expect(errs(run(P(`let <n:int=0/>\n<div>^{ meta.emit("<p>" + meta.get("n") + "</p>"); }</div>`)))).toEqual(["E-OPERATOR-OPERAND-TYPE"]);
  });
});

describe("s482 — refused by name, never misread (INTERIM, g-boot-meta-runtime-residue-s482)", () => {
  const one = (body, code, frag) => {
    const r = run(P(`let <label:string="hi"/>\n<items:string[replace]=(["a"])/>\n${body}`));
    expect(errs(r)).toEqual([code]);
    expect(r.diags.find((d) => d.code === code).message).toContain(frag);
  };
  test("Q7: in an <each> row — E-META-001", () => one(`<each in=@items as=it><p>^{ meta.emit("x"); }</p></each>`, "E-META-001", "`<each>` row"));
  test("in a logic body", () => one(`\${ function f() { ^{ meta.emit("x"); } } }`, "E-BOOTSTRAP-UNSUPPORTED", "inside a logic body"));
  test("as an attribute value", () => one(`<p title=^{ meta.emit("x"); }>t</p>`, "E-BOOTSTRAP-UNSUPPORTED", "value of the attribute"));
  test("inside <svg>", () => one(`<svg>^{ meta.emit("x"); }</svg>`, "E-BOOTSTRAP-UNSUPPORTED", "`<svg>` / `<math>`"));
  // s482-meta-phase3 built meta.subscribe and the runtime type registry (meta-phase3-s482.test.js); what stays refused:
  test("meta.subscribe with a computed name (ruling S481-meta-four item 2)", () => one(`<div>^{ const k = "label"; meta.subscribe(k, (v) => { meta.emit(v); }); }</div>`, "E-BOOTSTRAP-UNSUPPORTED", "computed cell name"));
  test("meta.types used as a value (only its reflect call is built)", () => one(`<div>^{ const t = meta.types.all; meta.emit(meta.get("label")); }</div>`, "E-BOOTSTRAP-UNSUPPORTED", "`meta.types.all` used as a value"));
  test("meta.set as a value", () => one(`<div>^{ const v = meta.set("label", "y"); }</div>`, "E-BOOTSTRAP-UNSUPPORTED", "`meta.set(…)` used as a value"));
  test("a ^{} nested in a runtime block", () => one(`<div>^{ ^{ meta.emit("x"); } }</div>`, "E-BOOTSTRAP-UNSUPPORTED", "nested in a runtime"));
  test("a meta.bindings entry of a `let` / a body-top local (no per-run snapshot, §22.5.2)", () => one(`\${ let v = 1; }\n<div>^{ meta.emit("<i>" + meta.bindings.v + "</i>"); }</div>`, "E-BOOTSTRAP-UNSUPPORTED", "`meta.bindings.v` — the entry of a `let` binding"));
  test("§22.3: a block at the file top, outside <program> (a top-level block), is not built", () => {
    const r = run(`^{ meta.emit("<p>top</p>"); }\n<program>\n<p>x</p>\n</program>\n`);
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a callback that writes a cell (a closure body is the bootstrap's)", () => {
    const r = run(P(`let <n:int=0/>\n<p>\${@n}</p>\n<div>^{ meta.timeout(1, () => { @n = 1; }); }</div>`));
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags.find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("callback");
  });
});

// s482 r1 (review of #2067, MED-1) — the placeholder `<span data-scrml-meta>` is judged by the
// E-HTML-PARSER-REPAIR check as the span it is (§24.5): where an author-written `<span>` is
// refused, so is a runtime block. Red on 048787db9: every family below compiled clean (the table
// family did not mount in Chromium; the raw-text family showed the placeholder as text).
describe("s482 r1 — a runtime block where its placeholder span cannot stand (MED-1, §24.5 / §22.12)", () => {
  const B = `^{ meta.emit("<b>E</b>"); }`;
  const refused = (body) => {
    const r = run(P(body));
    expect([body, errs(r)]).toEqual([body, ["E-HTML-PARSER-REPAIR"]]);
    expect(r.diags.find((d) => d.code === "E-HTML-PARSER-REPAIR").message).toContain("placeholder `<span data-scrml-meta>`");
  };
  test("the table family: table / tbody / thead / tfoot / tr / colgroup, and an `if=` arm rooted at a <tr>", () => {
    for (const b of [`<table id="t">${B}</table>`, `<table><tbody>${B}</tbody></table>`, `<table><thead>${B}</thead></table>`,
                     `<table><tfoot>${B}</tfoot></table>`, `<table><tbody><tr>${B}</tr></tbody></table>`,
                     `<table><colgroup>${B}</colgroup></table>`,
                     `let <x:bool=true/>\n<table><tbody><tr if=@x>${B}</tr></tbody></table>`]) refused(b);
  });
  test("the raw-text / RCDATA family: textarea / title / xmp / iframe / noscript", () => {
    for (const b of [`<form><textarea>${B}</textarea></form>`, `<title>${B}</title>`, `<xmp>${B}</xmp>`,
                     `<iframe>${B}</iframe>`, `<noscript>${B}</noscript>`]) refused(b);
  });
  test("the inert family: an HTML <template>'s content, at any depth (one report per block)", () => {
    for (const b of [`<template>${B}</template>`, `<template><div><p>${B}</p></div></template>`,
                     `<template><table>${B}</table></template>`]) refused(b);
  });
  test("legal positions are unchanged: div, p, li, td, form, caption, select / optgroup / option, the program body", () => {
    for (const b of [`<div>${B}</div>`, `<p>${B}</p>`, `<ul><li>${B}</li></ul>`, `<table><tbody><tr><td>${B}</td></tr></tbody></table>`,
                     `<form>${B}</form>`, `<table><caption>${B}</caption></table>`, `<select><optgroup label="g">${B}</optgroup></select>`,
                     `<select><option>${B}</option></select>`, `${B}\n<p>x</p>`]) {
      expect([b, errMsgs(run(P(b)))]).toEqual([b, []]);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. the runtime (happy-dom; the bootstrap runtime module, imported AFTER the DOM is registered —
//    the gate captures the platform's accessors at load)
// ---------------------------------------------------------------------------
let rt, dir;
const logs = [];
const origError = console.error;
const restoreTries = [];
// s482 r1 (review of #2080, LOW-1): happy-dom is registered by this file only if no other file in the
// process did, and unregistered by this file when it ends — the next file sees the globals it found
let registered = false;
beforeAll(async () => {
  if (!globalThis.document) { GlobalRegistrator.register({ url: "http://localhost/" }); registered = true; }
  dir = mkdtempSync(join(tmpdir(), "s482-meta-rt-"));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  rt = await import(join(dir, "scrml-runtime.js"));
}, { timeout: 60000 });
afterAll(async () => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  if (registered) { await GlobalRegistrator.unregister(); registered = false; }
});

const capture = () => { logs.length = 0; console.error = (...a) => logs.push(a.map(String).join(" ")); };
const release = () => { console.error = origError; };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A page holding one placeholder (inside a page <form> when `inForm`). */
function page(id, initial = "old", inForm = false) {
  document.body.innerHTML = inForm
    ? `<form id="pf"><span data-scrml-meta="${id}">${initial}</span></form>`
    : `<span data-scrml-meta="${id}">${initial}</span>`;
  return document.querySelector(`[data-scrml-meta="${id}"]`);
}

/** impl#1's oracle list `name` (an array literal), read from its gate test — one list, not a copy. */
function oracle(name) {
  const src = readFileSync(ORACLE, "utf8");
  const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!m) throw new Error(`no ${name} in ${ORACLE}`);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${m[1]};`)();
}

/** What the pre-S458 ungated `innerHTML` path produced (impl#1's oracle). */
function ungated(html) {
  const span = document.createElement("span");
  span.innerHTML = html;
  return span.innerHTML;
}

describe("s482 — the runtime meta.emit gate is impl#1's (§22.12), judged with impl#1's oracle lists", () => {
  test("every REFUSED payload: nothing written, one report naming no value, nothing ran", () => {
    const refused = oracle("REFUSED");
    expect(refused.length).toBeGreaterThan(40);
    for (const [label, html, secret] of refused) {
      const ph = page("m1");
      const scope = rt.root.child();
      capture();
      try { rt.metaEffect(scope, ph, "m1", (task, meta) => { meta.emit(html); }); } finally { release(); }
      expect([label, ph.innerHTML]).toEqual([label, "old"]);
      expect([label, logs.length]).toEqual([label, 1]);
      expect(logs[0]).toContain("Nothing was written");
      expect(logs[0]).not.toContain(secret === "onerror" ? "window.__pwn" : secret);
      expect(globalThis.__pwn).toBeUndefined();
      scope.dispose();
    }
  });

  test("every ADMITTED payload is inserted exactly as the ungated path inserted it", () => {
    for (const html of oracle("ADMITTED")) {
      const ph = page("m1");
      const scope = rt.root.child();
      capture();
      try { rt.metaEffect(scope, ph, "m1", (task, meta) => { meta.emit(html); }); } finally { release(); }
      expect([html, logs]).toEqual([html, []]);
      expect([html, ph.innerHTML]).toEqual([html, ungated(html)]);
      scope.dispose();
    }
  });

  test("S459 round 4 F1 — inside a page <form>, a form control is refused; other markup is admitted", () => {
    for (const html of ['<input type="hidden" name="amount" value="9">', '<p>ok <button type="submit">go</button></p>', "<select><option>1</option></select>"]) {
      const ph = page("m2", "old", true);
      const scope = rt.root.child();
      capture();
      try { rt.metaEffect(scope, ph, "m2", (task, meta) => { meta.emit(html); }); } finally { release(); }
      expect([html, ph.innerHTML, logs.length]).toEqual([html, "old", 1]);
      scope.dispose();
    }
    const ph = page("m2", "old", true);
    const scope = rt.root.child();
    rt.metaEffect(scope, ph, "m2", (task, meta) => { meta.emit('<p id="hint">Enter <b>your</b> name</p><template><input name="q"></template>'); });
    expect(document.querySelector("#pf #hint b").textContent).toBe("your");
    expect(document.querySelectorAll("#pf template").length).toBe(1);
    scope.dispose();
  });

  test("an emit made while the placeholder is detached (a mount's render) is held, then judged in the page", async () => {
    document.body.innerHTML = `<form id="pf"></form>`;
    const ph = document.createElement("span");
    ph.setAttribute("data-scrml-meta", "m3");
    const scope = rt.root.child();
    capture();
    rt.metaEffect(scope, ph, "m3", (task, meta) => { meta.emit('<input name="amount" value="9">'); });
    expect(ph.innerHTML).toBe("");                         // nothing yet: the gate cannot see the page form
    document.querySelector("#pf").appendChild(ph);       // the insert
    await tick();
    release();
    expect(ph.innerHTML).toBe("");                         // judged in the page: inside a page form — refused
    expect(logs.length).toBe(1);
    scope.dispose();
  });
});

describe("s482 — the effect (§22.5.1)", () => {
  test("re-runs when a meta.get cell changes; a direct read is no dependency (impl#1 parity); its own write never re-runs it", () => {
    const ph = page("e1", "");
    const scope = rt.root.child();
    const a = rt.cell("a");
    const b = rt.cell("b");
    let runs = 0;
    rt.metaEffect(scope, ph, "e1", (task, meta) => {
      runs++;
      const v = meta.get(() => a.get());
      meta.emit("<p>" + v + b.get() + "</p>");
      a.set(v);                                          // its own write of a dependency
    });
    expect(runs).toBe(1);
    expect(ph.innerHTML).toBe("<p>ab</p>");
    a.set("A");
    expect(runs).toBe(2);
    expect(ph.innerHTML).toBe("<p>Ab</p>");
    b.set("B");                                          // read directly: not a dependency
    expect(runs).toBe(2);
    scope.dispose();
    a.set("z");
    expect(runs).toBe(2);
  });

  test("before a re-run: the run's timers are cleared, then its cleanups run LIFO; a fresh meta each run", async () => {
    const ph = page("e2", "");
    const scope = rt.root.child();
    const a = rt.cell(0);
    const order = [];
    const metas = [];
    let fired = 0;
    rt.metaEffect(scope, ph, "e2", (task, meta) => {
      metas.push(meta);
      const n = meta.get(() => a.get());
      meta.interval(1, () => { fired++; });
      meta.cleanup(() => order.push("c1-" + n));
      meta.cleanup(() => order.push("c2-" + n));
    });
    await tick(15);
    const before = fired;
    expect(before).toBeGreaterThan(0);
    a.set(1);
    expect(order).toEqual(["c2-0", "c1-0"]);
    expect(metas.length).toBe(2);
    expect(metas[0]).not.toBe(metas[1]);
    expect(Object.isFrozen(metas[1])).toBe(true);
    scope.dispose();
    expect(order).toEqual(["c2-0", "c1-0", "c2-1", "c1-1"]);
    const atDispose = fired;
    await tick(15);
    expect(fired).toBe(atDispose);                       // every timer cleared at teardown
  });

  test("timers: a clear of another block's id is a no-op; a timer started by a cleanup never runs", async () => {
    document.body.innerHTML = `<span data-scrml-meta="t1"></span><span data-scrml-meta="t2"></span>`;
    const s1 = rt.root.child();
    const s2 = rt.root.child();
    let id1 = null;
    let fired1 = 0;
    let late = 0;
    rt.metaEffect(s1, document.querySelector('[data-scrml-meta="t1"]'), "t1", (task, meta) => {
      id1 = meta.interval(1, () => { fired1++; });
      meta.cleanup(() => { meta.timeout(1, () => { late++; }); });
    });
    rt.metaEffect(s2, document.querySelector('[data-scrml-meta="t2"]'), "t2", (task, meta) => { meta.clearInterval(id1); });
    await tick(15);
    expect(fired1).toBeGreaterThan(0);
    s1.dispose();
    await tick(15);
    expect(late).toBe(0);
    s2.dispose();
  });

  test("a throw in the body ends that run only: reported, never silent, the mount goes on", async () => {
    const ph = page("e3", "");
    const scope = rt.root.child();
    const seen = [];
    const prev = globalThis.reportError;
    globalThis.reportError = (e) => seen.push(String(e));
    try {
      rt.metaEffect(scope, ph, "e3", () => { throw new Error("boom"); });
    } finally {
      globalThis.reportError = prev;
    }
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain("boom");
    scope.dispose();
  });
});

// s482 r1 (review of #2067) — MED-2 / MED-3 / LOW-1, each red on 048787db9.
describe("s482 r1 — cycles, stale held emits, dependencies only while running", () => {
  test("MED-2: two blocks that meta.set each other's meta.get cell settle as impl#1's do (x = 2, y = 3), not forever", () => {
    const scope = rt.root.child();
    const x = rt.cell(0);
    const y = rt.cell(0);
    let runs = 0;
    rt.metaEffect(scope, null, "cA", (task, meta) => { runs++; y.set(meta.get(() => x.get()) + 1); });
    rt.metaEffect(scope, null, "cB", (task, meta) => { runs++; x.set(meta.get(() => y.get()) + 1); });
    expect([x.peek(), y.peek()]).toEqual([2, 3]);
    expect(runs).toBe(3);
    // a later outside change runs the cycle once round, then stops (impl#1: the same)
    x.set(10);
    expect([x.peek(), y.peek()]).toEqual([12, 11]);
    scope.dispose();
  });

  test("MED-2: the backstop — a block runs at most __scrml_max_meta_runs (impl#1: 100) times in one flush, then impl#1's message", () => {
    const scope = rt.root.child();
    const a = rt.cell(0);
    const b = rt.cell(0);
    let runs = 0;
    globalThis.__scrml_max_meta_runs = 5;
    capture();
    try {
      rt.metaEffect(scope, null, "cap", (task, meta) => { runs++; b.set(meta.get(() => a.get()) + 1); });
      // an effect that writes what the block reads — the compiler never builds one (E-EFFECT-WRITES-STATE);
      // it is the one path past the cause rule, so the cap is what stops it
      rt.effect(scope, () => { a.set(b.get() + 1); });
    } finally {
      release();
      delete globalThis.__scrml_max_meta_runs;
    }
    expect(runs).toBe(6);                                // the first run, then 5 in the flush
    expect(logs).toEqual(["[scrml] meta effect cap exceeded 5 re-runs — possible infinite loop"]);
    scope.dispose();
  });

  test("MED-3: a connected emit drops the emits still held — the newer one is never overwritten by an older replay", async () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const ph = document.createElement("span");
    ph.setAttribute("data-scrml-meta", "m4");
    const scope = rt.root.child();
    const s = rt.cell("old");
    rt.metaEffect(scope, ph, "m4", (task, meta) => { meta.emit("<b>" + meta.get(() => s.get()) + "</b>"); });
    document.querySelector("#host").appendChild(ph);    // the insert, in the same task
    s.set("new");                                        // the re-run, connected: written now
    expect(ph.innerHTML).toBe("<b>new</b>");
    await tick();                                        // the held "old" is not replayed
    expect(ph.innerHTML).toBe("<b>new</b>");
    scope.dispose();
  });

  test("LOW-1: a meta.get in a timer or cleanup callback reads the cell and subscribes nothing (impl#1)", async () => {
    const ph = page("l1", "");
    const scope = rt.root.child();
    const s = rt.cell("a");
    const t = rt.cell(0);
    let runs = 0;
    rt.metaEffect(scope, ph, "l1", (task, meta) => {
      runs++;
      meta.get(() => t.get());
      meta.timeout(1, () => { meta.emit("<b>timer:" + meta.get(() => s.get()) + "</b>"); });
      meta.cleanup(() => { meta.get(() => s.get()); });
    });
    await tick(10);
    expect(ph.innerHTML).toBe("<b>timer:a</b>");
    s.set("b");
    expect(runs).toBe(1);
    t.set(1);                                            // a real dependency re-runs it; its cleanup's read is no dependency
    expect(runs).toBe(2);
    s.set("c");
    expect(runs).toBe(2);
    scope.dispose();
  });
});

// ---------------------------------------------------------------------------
// 3. the shipping path: scrml-boot compileSource → the conformance runner (happy-dom, fake clock)
// ---------------------------------------------------------------------------
let shipDir;
let seq = 0;
beforeAll(() => { shipDir = mkdtempSync(join(tmpdir(), "s482-meta-ship-")); });
afterAll(() => { if (shipDir) rmSync(shipDir, { recursive: true, force: true }); });

async function ship(src, input = []) {
  const { compileSource } = await import("../../../scripts/scrml-boot.ts");
  const { runBootstrapArtifact } = await import("../../../scripts/bootstrap-conformance.ts");
  const file = join(shipDir, `app${seq++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  capture();
  try {
    return await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
  } finally {
    release();
  }
}
const text = (run, sel) => String(run.body.querySelector(sel)?.textContent ?? "<none>").replace(/\s+/g, " ").trim();

describe("s482 — the shipping path", () => {
  test("the block renders at its place, re-renders when a meta.get cell changes, and a refused emit writes nothing", async () => {
    const r = await ship(P(`let <label:string="hi"/>
<div id="host">^{ meta.emit("<p id=\\"rt\\">" + meta.get("label") + "</p>"); }</div>
<div id="bad">^{ meta.emit("<p onclick=\\"x()\\">" + meta.get("label") + "</p>"); }</div>
<button id="b" onclick=\${() => { @label = "changed"; }}>b</button>`), [{ click: "#b" }]);
    expect(text(r, "#host #rt")).toBe("changed");
    expect(r.body.querySelector("#bad p")).toBeNull();
  }, 120000);

  test("a block in an `if=` region: its timer runs while mounted and is cleared (with its cleanup) at unmount", async () => {
    const r = await ship(P(`let <show:bool=true/>
let <ms:int=100/>
<div id="host" if=@show>^{
  let id = meta.interval(meta.get("ms"), () => { meta.emit("<p id=\\"t\\">tick</p>"); });
  meta.cleanup(() => { meta.clearInterval(id); });
  meta.emit("<p id=\\"t\\">start</p>");
}</div>
<button id="h" onclick=\${() => { @show = false; }}>h</button>`), [{ "advance-time": 250 }, { click: "#h" }, { "advance-time": 500 }]);
    expect(r.body.querySelector("#host")).toBeNull();
    expect(r.body.querySelector("[data-scrml-meta]")).toBeNull();
  }, 120000);

  test("Q11 — top-level runtime blocks run in source order with the body-top statements (impl#1: run1;meta1;run2;meta2;)", async () => {
    const r = await ship(P(`let <log:string=""/>
\${ @log = @log + "run1;"; }
^{ @log = @log + "meta1;"; }
\${ @log = @log + "run2;"; }
^{ @log = @log + "meta2;"; }
<p id="out">\${@log}</p>`));
    expect(text(r, "#out")).toBe("run1;meta1;run2;meta2;");
  }, 120000);
});

// ---------------------------------------------------------------------------
// 4. Chromium (SCRML_BROWSER_TESTS=1; SCRML_CHROMIUM names the binary)
// ---------------------------------------------------------------------------
const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const suite = ON ? describe : describe.skip;
let browser, server, cdir, port;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  cdir = mkdtempSync(join(tmpdir(), "s482-meta-chromium-"));
  copyFileSync(RUNTIME, join(cdir, "scrml-runtime.js"));
  // s482 r1 (LOW-1) — node:http, not Bun.serve: Bun.serve needs the host's Response, which happy-dom
  // replaces on registration (another file in the same process may have registered it first)
  server = createServer((req, res) => {
    const p = new URL(req.url, "http://localhost").pathname;
    if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    const f = join(cdir, p.slice(1));
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const { default: puppeteer } = await import("puppeteer");
  browser = await puppeteer.launch({ executablePath: BIN, headless: true, args: ["--no-sandbox"] });
}, { timeout: 180000 });
afterAll(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  if (cdir) rmSync(cdir, { recursive: true, force: true });
});

let cseq = 0;
async function openChromium(src) {
  const r = run(src);
  expect(errMsgs(r)).toEqual([]);
  const name = `p${cseq++}`;
  const out = mods.print.printProgram(r.core, `${name}.client.js`, "scrml-runtime.js");
  writeFileSync(join(cdir, `${name}.html`), out.html);
  writeFileSync(join(cdir, `${name}.client.js`), out.js);
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${name}.html`);
  await page.waitForFunction(() => document.body.innerHTML.includes("scrml"), { timeout: 10000 }).catch(() => {});
  return { page, errors };
}

suite("s482 — Chromium", () => {
  test("the DOM-clobbering payloads are refused: nothing written, nothing ran", async () => {
    const PAY = [
      '<form><input name=\\"lastChild\\"><img src=\\"x\\" onerror=\\"window.__pwn = 40\\"></form>',
      '<img src=\\"x\\" onerror=\\"window.__pwn = 41\\"><form><input name=\\"previousSibling\\"></form>',
      '<form action=\\"javascript:window.__pwn = 42\\"><input name=\\"attributes\\"><button>go</button></form>',
      '<form onclick=\\"window.__pwn = 43\\"><input name=\\"attributes\\"><button type=\\"button\\">go</button></form>',
    ];
    for (const pay of PAY) {
      const { page, errors } = await openChromium(P(`<div id="host">^{ meta.emit("${pay}"); }</div>`));
      await new Promise((r) => setTimeout(r, 100));
      const st = await page.evaluate(() => ({ n: document.querySelectorAll("#host form, #host img").length, pwn: window.__pwn }));
      expect([pay, st]).toEqual([pay, { n: 0, pwn: undefined }]);
      expect(errors.some((e) => e.includes("Nothing was written"))).toBe(true);
      await page.close();
    }
  }, 120000);

  test("r1 MED-2: two blocks that meta.set each other's meta.get cell terminate with impl#1's result (x = 2)", async () => {
    const { page } = await openChromium(P(`let <x:int=0/>\nlet <y:int=0/>\n<div>^{ meta.set("y", meta.get("x") + 1); }</div>\n<div>^{ meta.set("x", meta.get("y") + 1); }</div>\n<p id="o">\${@x}</p>`));
    expect(await page.evaluate(() => document.querySelector("#o")?.textContent)).toBe("2");
    await page.close();
  }, 60000);

  test("r1 MED-3: a block mounted by a click shows the newest emit, not a held older one", async () => {
    const { page } = await openChromium(P(`let <show:bool=false/>\nlet <s:string="old"/>\n<section if=@show><div id="h">^{ meta.emit("<b>" + meta.get("s") + "</b>"); }</div>\n<div>^{ meta.set("s", "new"); }</div></section>\n<p id="o">\${@s}</p>\n<button id="b" onclick=\${() => { @show = true; }}>b</button>`));
    await page.click("#b");
    await new Promise((r) => setTimeout(r, 100));
    expect(await page.evaluate(() => [document.querySelector("#h")?.textContent, document.querySelector("#o")?.textContent])).toEqual(["new", "new"]);
    await page.close();
  }, 60000);

  test("admitted markup renders, and re-renders on a meta.get cell change", async () => {
    const { page } = await openChromium(P(`let <label:string="hi"/>\n<div id="host">^{ meta.emit("<p id=\\"rt\\" class=\\"c\\">" + meta.get("label") + "</p>"); }</div>\n<button id="b" onclick=\${() => { @label = "changed"; }}>b</button>`));
    expect(await page.evaluate(() => document.querySelector("#host #rt")?.textContent)).toBe("hi");
    await page.click("#b");
    expect(await page.evaluate(() => document.querySelector("#host #rt")?.textContent)).toBe("changed");
    await page.close();
  }, 60000);
});
