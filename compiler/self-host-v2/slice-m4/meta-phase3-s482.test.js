// meta-phase3-s482.test.js — s482 (s482-meta-phase3): `^{}` phase 3 in the bootstrap — the runtime
// type registry (`reflect` / `meta.types.reflect` in a RUNTIME block, the compiler-known `TypeInfo`)
// and `meta.subscribe` (SPEC §22.4.2, §22.5.1, §22.5.4; gap g-boot-meta-runtime-residue-s482).
//
// Rulings: ruling:user-voice-scrml.md-S481-meta-four — item 1: a literal `reflect(User)` inside a
// RUNTIME block compiles (§22.4.2: emitted as `meta.types.reflect(...)`), no E-META-005; item 2:
// `meta.subscribe` takes a LITERAL cell name, resolved at compile time; item 3: the reflect shape is
// impl#1's (`kind`, `name`, `fields` of `{ name, type }`, `variants` of name strings) and a
// compiler-known `TypeInfo` types it. An entry carries all four members — a kind's missing list is
// the EMPTY list, in both phases (g-boot-meta-typeinfo-absent-member-s481's rec; §22.5.4 "SHALL be
// identical to what `reflect(TypeName)` produces in compile-time meta").
//
// Pinned here (red on base: every runtime `reflect` / `meta.types.reflect` / `meta.subscribe` was
// refused E-BOOTSTRAP-UNSUPPORTED there; an enum's compile-time `fields` was absent):
//   1. the compile — the registry lookup and its entries, `TypeInfo` typing, the refusals;
//   2. the runtime (happy-dom, the bootstrap runtime module): the lookup, a subscription's life;
//   3. the shipping path (scrml-boot compileSource + the conformance runner);
//   4. Chromium (SCRML_BROWSER_TESTS=1): a subscription re-renders on a click, once per change.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadM2, frontEnd } from "./harness.js";

const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const TYPES = `    type User:struct = { name: string, age: number }\n    type Color:enum = { Red, Green }`;
const P = (body) => `<program>\n${TYPES}\nlet <sel:string="User"/>\nlet <n:int=0/>\n${body}\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => d.code);
const errMsgs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`);
const print = (r) => mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");
const js = (body) => {
  const r = run(P(body));
  expect(errMsgs(r)).toEqual([]);
  const out = print(r);
  expect(out.refused).toEqual([]);
  return out.js;
};
const USER = `{ kind: "struct", name: "User", fields: [{ name: "name", type: "string" }, { name: "age", type: "number" }], variants: [] }`;
const COLOR = `{ kind: "enum", name: "Color", fields: [], variants: ["Red", "Green"] }`;

// ---------------------------------------------------------------------------
// 1. the compile
// ---------------------------------------------------------------------------
describe("s482 phase 3 — the runtime type registry compiles (§22.4.2 / §22.5.4)", () => {
  test("ruling item 1: a literal reflect(T) in a runtime block is the registry lookup of that type alone", () => {
    const out = js(`<div>^{ const i = reflect(User); meta.emit(\`<p>\${i.name}:\${i.kind}:\${i.fields.length}</p>\`); }</div>`);
    expect(out).toContain(`const i = meta$.types.reflect("User", [${USER}]);`);
    expect(out).not.toContain(`name: "Color"`);
  });

  test("a string literal and meta.types.reflect(\"T\") are the same lookup", () => {
    expect(js(`<div>^{ const i = reflect("Color"); meta.emit(i.variants.join(",")); }</div>`)).toContain(`meta$.types.reflect("Color", [${COLOR}])`);
    expect(js(`<div>^{ const i = meta.types.reflect("Color"); meta.emit(i.variants.join(",")); }</div>`)).toContain(`meta$.types.reflect("Color", [${COLOR}])`);
  });

  test("§22.4.2 strategy 2: a non-literal argument may name every type in scope — the registry holds them all", () => {
    const out = js(`<div>^{ const j = reflect(meta.get("sel")); if (j is not) { meta.emit("none"); } else { meta.emit(j.name); } }</div>`);
    expect(out).toContain(`const j = meta$.types.reflect(meta$.get(() => inst$.fields[0 /* sel */].get()), [`);
    expect(out).toContain(USER);
    expect(out).toContain(COLOR);
    expect(out).toContain(`{ kind: "primitive", name: "string", fields: [], variants: [] }`);
  });

  test("a PascalCase LOCAL is a value, not a type literal (the compile-time classifier's rule)", () => {
    const out = js(`<div>^{ const User2 = meta.get("sel"); const i = reflect(User2); if (i is given) { meta.emit(i.name); } }</div>`);
    expect(out).toContain(`meta$.types.reflect(User2, [`);
  });

  test("a type with no runtime reflect: TypeInfo is not shipped, and no other program changes", () => {
    const r = run(P(`<p>\${@n}</p>`));
    expect(errMsgs(r)).toEqual([]);
    expect(JSON.stringify(r.core.types)).not.toContain("TypeInfo");
  });
});

describe("s482 phase 3 — TypeInfo, the compiler-known type (ruling item 3)", () => {
  test("a literal reflect is TypeInfo; its members type-check; an unknown member is E-TYPE-004", () => {
    const r = run(P(`<div>^{ const i = reflect(User); meta.emit(i.nope); }</div>`));
    expect(errs(r)).toEqual(["E-TYPE-004"]);
    expect(errMsgs(r)[0]).toContain("`TypeInfo` has no field `nope`");
  });

  test("`fields` is FieldInfo[] and `fields.length` an int (string + int is E-OPERATOR-OPERAND-TYPE)", () => {
    expect(errs(run(P(`<div>^{ const i = reflect(User); meta.emit(i.name + i.fields.length); }</div>`)))).toEqual(["E-OPERATOR-OPERAND-TYPE"]);
    js(`<div>^{ const i: TypeInfo = reflect(User); const f: FieldInfo[] = i.fields; let s = ""; for (const x of f) { s = s + x.name + x.type; } meta.emit(s); }</div>`);
  });

  test("a non-literal reflect is TypeInfo | not: a member read before narrowing is E-TYPE-046 (§22.5.4: unknown → not)", () => {
    expect(errs(run(P(`<div>^{ const j = reflect(meta.get("sel")); meta.emit(j.name); }</div>`)))).toEqual(["E-TYPE-046"]);
    expect(errs(run(P(`<div>^{ const j = meta.types.reflect("Nope"); meta.emit(j.name); }</div>`)))).toEqual(["E-TYPE-046"]);
  });

  test("a user type named TypeInfo shadows the name; reflect still gives the compiler's entry", () => {
    const r = run(P(`    type TypeInfo:struct = { x: string }\n<div>^{ const i = reflect(User); meta.emit(i.name); }</div>`));
    expect(errMsgs(r)).toEqual([]);
  });

  test("compile-time reflect: an enum's `fields` and a struct's `variants` are the EMPTY list (the runtime entry's members)", () => {
    const r = run(P(`<div>^{ const c = reflect(Color); const u = reflect(User); emit(\`<p>\${c.fields.length}|\${c.variants.length}|\${u.fields.length}|\${u.variants.length}|\${c.kind}|\${c.name}</p>\`); }</div>`));
    expect(errMsgs(r)).toEqual([]);
    expect(print(r).html).toContain("<p>0|2|2|0|enum|Color</p>");
  });

  test("E-META-003 still refuses a literal naming no type", () => {
    expect(errs(run(P(`<div>^{ const i = reflect(Nope); meta.emit(meta.get("sel")); }</div>`)))).toEqual(["E-META-003"]);
  });
});

describe("s482 phase 3 — meta.subscribe (§22.5.1; ruling item 2: literal names)", () => {
  test("a literal name: the cell read is a thunk, the callback takes the new value; its value is the unsubscribe function", () => {
    const out = js(`<div>^{ const off = meta.subscribe("sel", (v) => { meta.emit(v); }); if (meta.get("n") > 3) { off(); } }</div>`);
    expect(out).toContain(`const off = meta$.subscribe(() => inst$.fields[0 /* sel */].get(), v => {`);
    expect(out).toContain(`off();`);
    expect(js(`<div>^{ meta.subscribe("sel", (v) => meta.emit(v)); }</div>`)).toContain(`meta$.subscribe(() => inst$.fields[0 /* sel */].get(), v => meta$.emit(v));`);
    expect(js(`<div>^{ meta.subscribe("sel", () => { meta.emit("x"); }); }</div>`)).toContain(`meta$.subscribe(() => inst$.fields[0 /* sel */].get(), () => {`);
  });

  test("the parameter is the cell's type: a written other type is E-TYPE-031", () => {
    expect(errs(run(P(`<div>^{ meta.subscribe("n", (v: string) => { meta.emit(v); }); }</div>`)))).toContain("E-TYPE-031");
  });

  test("a literal naming no cell is E-SCOPE-001; a computed name is refused as not supported yet", () => {
    expect(errs(run(P(`<div>^{ meta.subscribe("zz", (v) => { meta.emit("x"); }); }</div>`)))).toEqual(["E-SCOPE-001"]);
    const r = run(P(`<div>^{ const k = "sel"; meta.subscribe(k, (v) => { meta.emit(v); }); }</div>`));
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errMsgs(r)[0]).toContain("computed cell name");
  });

  test("the callback is the bootstrap's closure body (as a timer's): a cell write in it is refused; two parameters are refused", () => {
    const w = run(P(`<div>^{ meta.subscribe("n", (v) => { @sel = "x"; }); }</div>`));
    expect(errs(w)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errMsgs(w)[0]).toContain("callback");
    const t = run(P(`<div>^{ meta.subscribe("n", (a, b) => { meta.emit("x"); }); }</div>`));
    expect(errs(t)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errMsgs(t)[0]).toContain("at most one parameter");
  });
});

// ---------------------------------------------------------------------------
// 2. the runtime (happy-dom; the bootstrap runtime module)
// ---------------------------------------------------------------------------
let rt, dir;
beforeAll(async () => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "http://localhost/" });
  dir = mkdtempSync(join(tmpdir(), "s482-meta3-rt-"));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  rt = await import(join(dir, "scrml-runtime.js"));
}, { timeout: 60000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

function page(id) {
  document.body.innerHTML = `<span data-scrml-meta="${id}"></span>`;
  return document.querySelector(`[data-scrml-meta="${id}"]`);
}

describe("s482 phase 3 — the runtime", () => {
  test("meta.types.reflect: the entry of that name, else not (null) — never a prototype member", () => {
    const ph = page("r1");
    const scope = rt.root.child();
    const got = [];
    const entries = [{ kind: "enum", name: "Color", fields: [], variants: ["Red"] }];
    rt.metaEffect(scope, ph, "r1", (task, meta) => {
      got.push(meta.types.reflect("Color", entries), meta.types.reflect("Nope", entries), meta.types.reflect("constructor", entries), meta.types.reflect(3, entries));
    });
    expect(got).toEqual([entries[0], null, null, null]);
    scope.dispose();
  });

  test("a subscription: called with the new value on each change; never a dependency of the block; ended by the re-run and by teardown", () => {
    const ph = page("s1");
    const scope = rt.root.child();
    const c = rt.cell(0);
    const dep = rt.cell("a");
    const seen = [];
    let runs = 0;
    rt.metaEffect(scope, ph, "s1", (task, meta) => {
      runs++;
      const tag = meta.get(() => dep.get());
      meta.subscribe(() => c.get(), (v) => { seen.push(tag + v); });
    });
    expect(seen).toEqual([]);                      // subscribing calls nothing
    c.set(1);
    c.set(2);
    expect(seen).toEqual(["a1", "a2"]);
    expect(runs).toBe(1);                          // the subscribed cell is no dependency
    dep.set("b");                                  // a re-run: the first subscription ends, the new one starts
    expect(runs).toBe(2);
    c.set(3);
    expect(seen).toEqual(["a1", "a2", "b3"]);
    scope.dispose();                               // teardown ends it
    c.set(4);
    expect(seen).toEqual(["a1", "a2", "b3"]);
  });

  test("the unsubscribe function ends it; a subscription made by a cleanup never starts", () => {
    const ph = page("s2");
    const scope = rt.root.child();
    const c = rt.cell(0);
    const t = rt.cell(0);
    const seen = [];
    let off = null;
    rt.metaEffect(scope, ph, "s2", (task, meta) => {
      meta.get(() => t.get());
      off = meta.subscribe(() => c.get(), (v) => { seen.push("s" + v); });
      meta.cleanup(() => { meta.subscribe(() => c.get(), (v) => { seen.push("late" + v); }); });
    });
    c.set(1);
    off();
    c.set(2);
    t.set(1);                                      // the re-run discharges the cleanup (its subscribe is a no-op)
    c.set(3);
    expect(seen).toEqual(["s1", "s3"]);
    scope.dispose();
  });

  test("a callback's meta.emit renders; a throw in a callback is reported and ends that call only", async () => {
    const ph = page("s3");
    const scope = rt.root.child();
    const c = rt.cell(0);
    const errors = [];
    const saved = globalThis.reportError;
    globalThis.reportError = (e) => errors.push(String(e));
    try {
      rt.metaEffect(scope, ph, "s3", (task, meta) => {
        meta.subscribe(() => c.get(), (v) => { if (v === 2) throw new Error("boom"); meta.emit("<b>" + v + "</b>"); });
      });
      c.set(1);
      await new Promise((r) => setTimeout(r, 0));
      expect(ph.innerHTML).toBe("<b>1</b>");
      c.set(2);
      c.set(3);
      await new Promise((r) => setTimeout(r, 0));
      expect(ph.innerHTML).toBe("<b>3</b>");
      expect(errors.length).toBe(1);
    } finally {
      globalThis.reportError = saved;
      scope.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. the shipping path: scrml-boot compileSource → the conformance runner (happy-dom)
// ---------------------------------------------------------------------------
let shipDir;
let seq = 0;
beforeAll(() => { shipDir = mkdtempSync(join(tmpdir(), "s482-meta3-ship-")); });
afterAll(() => { if (shipDir) rmSync(shipDir, { recursive: true, force: true }); });

async function ship(src, input = []) {
  const { compileSource } = await import("../../../scripts/scrml-boot.ts");
  const { runBootstrapArtifact } = await import("../../../scripts/bootstrap-conformance.ts");
  const file = join(shipDir, `app${seq++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
}
const text = (r, sel) => String(r.body.querySelector(sel)?.textContent ?? "<none>").replace(/\s+/g, " ").trim();

describe("s482 phase 3 — the shipping path", () => {
  test("reflect renders a literal type's entry and a cell-named one; a name that is no type is not", async () => {
    const r = await ship(P(`<div id="a">^{ const i = reflect(User); meta.emit(\`<p>\${i.kind}:\${i.name}:\${i.fields.length}:\${i.variants.length}</p>\`); }</div>
<div id="b">^{
  const j = reflect(meta.get("sel"));
  if (j is not) {
    meta.emit("<p>none</p>");
  } else {
    let s = "";
    for (const f of j.fields) { s = s + f.name + "=" + f.type + ";"; }
    meta.emit("<p>" + j.kind + ":" + s + j.variants.join("|") + "</p>");
  }
}</div>
<button id="c" onclick=\${() => { @sel = "Color"; }}>c</button>
<button id="x" onclick=\${() => { @sel = "Nope"; }}>x</button>`), [{ click: "#c" }]);
    expect(text(r, "#a p")).toBe("struct:User:2:0");
    expect(text(r, "#b p")).toBe("enum:Red|Green");
    const r2 = await ship(P(`<div id="b">^{ const j = reflect(meta.get("sel")); if (j is not) { meta.emit("<p>none</p>"); } else { meta.emit("<p>" + j.name + "</p>"); } }</div>
<button id="x" onclick=\${() => { @sel = "Nope"; }}>x</button>`), [{ click: "#x" }]);
    expect(text(r2, "#b p")).toBe("none");
  }, 120000);

  test("a subscription re-renders on each change of its cell; the block itself does not re-run", async () => {
    const r = await ship(P(`<div id="h">^{
  meta.emit("<p>start</p>");
  meta.subscribe("n", (v) => { meta.emit(\`<p>n=\${v}</p>\`); });
}</div>
<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>`), [{ click: "#b" }, { click: "#b" }]);
    expect(text(r, "#h p")).toBe("n=2");
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
  cdir = mkdtempSync(join(tmpdir(), "s482-meta3-chromium-"));
  copyFileSync(RUNTIME, join(cdir, "scrml-runtime.js"));
  // node:http, not Bun.serve: Bun.serve needs the host's Response, which happy-dom replaces on
  // registration (and another file in the same process may have registered it before this one loads)
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

suite("s482 phase 3 — Chromium", () => {
  test("a subscription re-renders synchronously with the click that changed its cell, once per change; the block runs once", async () => {
    const { page, errors } = await openChromium(P(`let <runs:int=0/>
<div id="h">^{
  meta.emit("<p>start</p>");
  meta.subscribe("n", (v) => { meta.emit(\`<p>n=\${v}</p>\`); });
}</div>
<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>`));
    await new Promise((r) => setTimeout(r, 50));
    expect(await page.evaluate(() => document.querySelector("#h p")?.textContent)).toBe("start");
    const seen = [];
    for (let i = 0; i < 3; i++) {
      await page.click("#b");
      seen.push(await page.evaluate(() => document.querySelector("#h p")?.textContent));
    }
    expect(seen).toEqual(["n=1", "n=2", "n=3"]);
    expect(errors).toEqual([]);
    await page.close();
  }, 60000);

  test("reflect of a cell-named type re-renders when the cell names another type", async () => {
    const { page } = await openChromium(P(`<div id="h">^{ const j = reflect(meta.get("sel")); if (j is not) { meta.emit("<p>none</p>"); } else { meta.emit("<p>" + j.kind + ":" + j.name + "</p>"); } }</div>
<button id="b" onclick=\${() => { @sel = "Color"; }}>b</button>`));
    expect(await page.evaluate(() => document.querySelector("#h p")?.textContent)).toBe("struct:User");
    await page.click("#b");
    expect(await page.evaluate(() => document.querySelector("#h p")?.textContent)).toBe("enum:Color");
    await page.close();
  }, 60000);
});
