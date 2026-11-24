// effect-host-s482.test.js — s482 (s482-effect-host): host code under the §6.7.4 no-write rule
// (gap g-boot-effect-host-call-hang-s482; RULED S482, ruling:user-voice-scrml.md-S482-effect-host-call:
// "treat host calls as unproven under the §6.7.4 no-write rule (newly-rejecting; corpus measured
// first), plus an effect run cap as the backstop").
//
// Pinned here:
//   1. the compile — an `<effect>` body reaching an UNPROVEN host-backed function (a user `<host>`
//      binding, or a stdlib `import:host` wrapper whose host file is not on `pureHostFile`) is
//      E-EFFECT-WRITE-UNPROVEN naming the chain (analyze.scrml hostDiags, reusing hostChain); the
//      allow-listed `scrml:math` / `scrml:random` stay proven. Red on base 451a4ce04: every refusal
//      below compiled clean there (probe p-MeC2ee hung the page);
//   2. the same over a runtime `^{}` BLOCK body (the gap's item 3 — a stale value, no error, on base;
//      analyze.scrml metaBlockHostDiags), E-BOOTSTRAP-UNSUPPORTED INTERIM; a callback's host call is
//      still reported once (metaCbDiags), not twice;
//   3. the runtime backstop (happy-dom, the bootstrap runtime module): an effect taken from the
//      effect queue runs at most 100 times in one flush (`globalThis.__scrml_max_meta_runs`
//      overrides), logging the cycle once — on base the same drive never returned;
//   4. #2080 r3 review INFO-1: the export names of the allow-listed host files are pinned, so a new
//      export forces a re-read of the allow-list;
//   5. Chromium (SCRML_BROWSER_TESTS=1): p-MeC2ee's runtime shape (glue that clicks a button whose
//      handler writes the effect's dep) leaves the page responsive.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");
const STDLIB = join(import.meta.dir, "..", "..", "..", "stdlib");

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => d.code);
const errMsgs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`);

// p-MeC2ee: glue that clicks the button whose handler writes the effect's dep
const HOST = `<host src="./glue.js">\n  clickB() -> int\n</host>\n`;
const P = (pre, body, head = HOST) => `${head}<program>\n${pre}\nlet <n:int=0/>\n${body}\n<p id="c">\${@n}</p>\n<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>\n</program>\n`;
const EFF = (stmt) => `<effect deps=[@n]>\${ const k = @n; ${stmt} }</effect>`;
const refused = (code, src, ...needles) => {
  const r = run(src);
  expect(errs(r)).toEqual([code]);
  for (const n of needles) expect(errMsgs(r)[0]).toContain(n);
};
const clean = (src) => {
  const r = run(src);
  expect(errMsgs(r)).toEqual([]);
  return r;
};

// ---------------------------------------------------------------------------
// 1. the `<effect>` no-write rule takes host code as unproven
// ---------------------------------------------------------------------------
describe("s482 effect-host — an `<effect>` body reaching a `<host>`-backed function is E-EFFECT-WRITE-UNPROVEN", () => {
  test("a direct call (probe p-MeC2ee) is refused, naming the host function", () => {
    refused("E-EFFECT-WRITE-UNPROVEN", P("", EFF("const z = clickB();")), "this `<effect>` calls `clickB()`, a `<host>`-backed function (§21.3.1)", "fails closed (§6.7.4 rule 4)");
  });

  test("through a scrml wrapper at any depth, naming the chain", () => {
    refused("E-EFFECT-WRITE-UNPROVEN", P("function ck() -> int { return clickB(); }", EFF("const z = ck();")), "through `ck() → clickB()`");
    refused("E-EFFECT-WRITE-UNPROVEN", P("function ck() -> int { return clickB(); }\nfunction ck2() -> int { return ck(); }", EFF("if (ck2() == 0) { }")), "through `ck2() → ck() → clickB()`");
  });

  test("a wrapper handed on as a value is refused here; the host function itself as a value is the binder's (one report)", () => {
    refused("E-EFFECT-WRITE-UNPROVEN", P("function ck() -> int { return clickB(); }", EFF("const g = ck;")), "hands `ck` on as a function value, and it reaches `clickB()`");
    refused("E-BOOTSTRAP-UNSUPPORTED", P("", EFF("const g = clickB;")), "used as a value is not in the bootstrap");
  });

  test("the keyword spelling is held to the same rule", () => {
    const r = run(P("", "when @n changes { const z = clickB(); }"));
    expect(errs(r)).toEqual(["E-EFFECT-WRITE-UNPROVEN"]);
    expect(errMsgs(r)[0]).toContain("this `when … changes` effect calls `clickB()`");
  });

  test("an effect calling no host function still compiles; a host call in an event handler is untouched", () => {
    clean(P("function inc(x: int) -> int { return x + 1; }", EFF("const z = inc(k);")));
    clean(P("", `<button id="h" onclick=\${() => { const z = clickB(); }}>h</button>`));
  });
});

const STDP = (pre, fns, stmt) => `${pre}<program>\n${fns}\nlet <n:int=0/>\n<effect deps=[@n]>\${ const k = @n; ${stmt} }</effect>\n<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>\n</program>\n`;
const stdRun = (...a) => frontEndStdlib(mods, [{ path: "app.scrml", src: STDP(...a) }], "app.scrml");
const MATH = `import { floor } from "scrml:math";\n`;

describe("s482 effect-host — the allow-list (pureHostFile) is reused, not `f.host is given`", () => {
  test("`scrml:math` floor (direct, through a helper) and `scrml:random` randomInt stay proven", () => {
    for (const r of [
      stdRun(MATH, "", "const z = floor(2.5);"),
      stdRun(MATH, "function half(x: number) -> int { return floor(x / 2.0); }", "const z = half(1.0 * k);"),
      stdRun(`import { randomInt } from "scrml:random";\n`, "", "const z = randomInt(1, 6);"),
    ]) {
      expect(errMsgs(r)).toEqual([]);
      expect(r.stdlib.refused).toEqual([]);
    }
  });

  test("a stdlib host module NOT on the list is refused, named by its module, never as a `<host>`", () => {
    const STD = "scrml:hb/index.scrml";
    const r = frontEnd(mods, [
      { path: STD, src: 'import:host { hf } from "./h.js";\n${\n    export fn f(x: int) -> int {\n        return hf(x);\n    }\n}\n' },
      { path: "app.scrml", src: `import { f } from "scrml:hb";\n<program>\nlet <n:int=0/>\n<effect deps=[@n]>\${ const z = f(@n); }</effect>\n<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>\n</program>\n` },
    ], "app.scrml", { stdlibPaths: [STD] });
    expect(errs(r)).toEqual(["E-EFFECT-WRITE-UNPROVEN"]);
    expect(errMsgs(r)[0]).toContain("calls `f()`, a host-backed function of the stdlib module `scrml:hb`");
    expect(errMsgs(r)[0]).not.toContain("`<host>`");
  });
});

// ---------------------------------------------------------------------------
// 2. a runtime `^{}` block body (the gap's item 3)
// ---------------------------------------------------------------------------
describe("s482 effect-host — a runtime `^{}` block body reaching a `<host>`-backed function is refused (item 3)", () => {
  const BLK = (stmt) => `<div id="o">^{ const q = meta.get("n"); ${stmt} meta.emit(\`<p>\${q}</p>\`); }</div>`;

  test("a direct call and a call through a wrapper (probe hcases3 B11b's stale value) are refused, naming the chain", () => {
    refused("E-BOOTSTRAP-UNSUPPORTED", P("", BLK("const z0 = clickB();")), "this runtime `^{}` block calls `clickB()`, a `<host>`-backed function (§21.3.1)", "stale value");
    refused("E-BOOTSTRAP-UNSUPPORTED", P("function ck() -> int { return clickB(); }", BLK("const z0 = ck();")), "through `ck() → clickB()`");
  });

  test("#2089 r1 MED-3: the block refusal is a bootstrap INTERIM limit, not the §6.7.4 effect rule (the ruling covers `<effect>` only)", () => {
    const m = errMsgs(run(P("", BLK("const z0 = clickB();"))))[0];
    expect(m).toContain("INTERIM, g-boot-meta-runtime-residue-s482");
    expect(m).not.toContain("§6.7.4");
  });

  test("a host call in the block's callback is reported once (the callback rule), not again by the block rule", () => {
    const r = run(P("", `<div id="o">^{ meta.subscribe("n", (v) => { const z = clickB(); meta.emit(\`<p>\${v}</p>\`); }); }</div>`));
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errMsgs(r)[0]).toContain("the callback of `meta.subscribe(…)` calls `clickB()`");
  });

  test("a block calling no host function, and the allow-listed floor, still compile", () => {
    clean(P("function inc(x: int) -> int { return x + 1; }", BLK("const z0 = inc(q);")));
    const src = `${MATH}<program>\nlet <n:int=0/>\n<div id="o">^{ const q = meta.get("n"); const z = floor(2.5); meta.emit(\`<p>\${q}:\${z}</p>\`); }</div>\n</program>\n`;
    const r = frontEndStdlib(mods, [{ path: "app.scrml", src }], "app.scrml");
    expect(errMsgs(r)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. the runtime backstop: an effect run cap per flush
// ---------------------------------------------------------------------------
let rt, dir;
let registered = false;
beforeAll(async () => {
  if (!globalThis.document) { GlobalRegistrator.register({ url: "http://localhost/" }); registered = true; }
  dir = mkdtempSync(join(tmpdir(), "s482-effect-host-rt-"));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  rt = await import(join(dir, "scrml-runtime.js"));
}, { timeout: 60000 });
afterAll(async () => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  if (registered) { await GlobalRegistrator.unregister(); registered = false; }
});

describe("s482 effect-host — the effect queue's run cap (the backstop)", () => {
  test("an effect whose run writes its own dep (below the compiler's refusal) stops at 100 runs in one flush and logs the cycle once", () => {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    let runs = 0;
    try {
      rt.effectOn(scope, [n], () => { runs++; n.set(n.get() + 1); });
      const t0 = Date.now();
      n.set(1);                                      // the click
      expect(Date.now() - t0).toBeLessThan(5000);
      expect(runs).toBe(100);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain("[scrml] effect exceeded 100 runs in one update — possible infinite loop");
      runs = 0;
      n.set(1000);                                   // the next flush counts afresh
      expect(runs).toBe(100);
      expect(logged.length).toBe(2);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("the cap is `globalThis.__scrml_max_meta_runs`; two effects writing each other's deps settle too", () => {
    const scope = rt.root.child();
    const a = rt.cell(0);
    const b = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...x) => logged.push(x.join(" "));
    globalThis.__scrml_max_meta_runs = 5;
    try {
      rt.effectOn(scope, [a], () => { b.set(a.get() + 1); });
      rt.effectOn(scope, [b], () => { a.set(b.get() + 1); });
      a.set(1);
      expect(logged.length).toBeGreaterThan(0);
      expect(logged[0]).toContain("exceeded 5 runs");
      expect(a.get()).toBeLessThan(20);
    } finally {
      delete globalThis.__scrml_max_meta_runs;
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("an effect that writes no cell runs once per change, as before (no log)", () => {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    const seen = [];
    try {
      rt.effectOn(scope, [n], () => { seen.push(n.get()); });
      for (let i = 1; i <= 150; i++) n.set(i);       // 150 flushes, one run each
      expect(seen.length).toBe(150);
      expect(logged).toEqual([]);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. #2080 r3 review INFO-1 — the allow-listed host files' export names, pinned
// ---------------------------------------------------------------------------
describe("s482 effect-host — the allow-list's host files are pinned (INFO-1)", () => {
  // analyze.scrml pureHostFile names `math/host.js` and `random/host.js` as host code that cannot call
  // back into page code. A NEW EXPORT (or an import) in either file must be read against that claim
  // before this list changes: update pureHostFile's comment, then this pin.
  test("math/host.js and random/host.js export exactly these names, all functions, and import nothing", async () => {
    const expected = {
      math: ["abs", "ceil", "floor", "isNaN", "max", "min", "parseFloat", "parseInt", "roundHalfEven", "roundHalfUp", "toNumber", "trunc"],
      random: ["random", "randomInt"],
    };
    for (const [m, names] of Object.entries(expected)) {
      const f = join(STDLIB, m, "host.js");
      const ns = await import(f);
      expect([m, Object.keys(ns).sort()]).toEqual([m, names]);
      for (const k of names) expect([m, k, typeof ns[k]]).toEqual([m, k, "function"]);
      const srcText = readFileSync(f, "utf8");
      expect([m, /^\s*import\b|\bimport\s*\(|\brequire\s*\(/m.test(srcText)]).toEqual([m, false]);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Chromium (SCRML_BROWSER_TESTS=1; SCRML_CHROMIUM names the binary)
// ---------------------------------------------------------------------------
const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const suite = ON ? describe : describe.skip;
let browser, server, cdir, port;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  cdir = mkdtempSync(join(tmpdir(), "s482-effect-host-chromium-"));
  copyFileSync(RUNTIME, join(cdir, "scrml-runtime.js"));
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

suite("s482 effect-host — Chromium", () => {
  test("p-MeC2ee's shape (glue clicking a button whose handler writes the effect's dep) leaves the page responsive", async () => {
    // the probe cannot compile any more; its runtime shape is written against the runtime directly
    writeFileSync(join(cdir, "mec.html"), `<!doctype html><html><body><p id="c"></p><button id="b">b</button><button id="go">go</button>
<script type="module">
import * as rt from "./scrml-runtime.js";
const n = rt.cell(0);
const scope = rt.root.child();
function clickB() { document.getElementById("b").click(); return 0; }
rt.effectOn(scope, [n], () => { const k = n.get(); const z = clickB(); });
document.querySelector("#b").addEventListener("click", () => { n.set(n.get() + 1); document.querySelector("#c").textContent = String(n.get()); });
document.querySelector("#go").addEventListener("click", () => n.set(n.get() + 1));
document.body.dataset.ready = "1";
</script></body></html>`);
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/mec.html`);
    await page.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 10000 });
    page.click("#go").catch(() => {});
    const t = await Promise.race([
      (async () => {
        await new Promise((r) => setTimeout(r, 300));
        return await page.evaluate(() => "responsive " + document.querySelector("#c").textContent);
      })(),
      new Promise((r) => setTimeout(() => r("PAGE UNRESPONSIVE after 8s"), 8000)),
    ]);
    // the go click, then 100 effect runs each clicking #b once
    expect(t).toBe("responsive 101");
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("[scrml] effect exceeded 100 runs in one update");
    await page.close();
  }, 60000);
});
