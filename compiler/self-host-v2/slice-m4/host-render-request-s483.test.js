// host-render-request-s483.test.js — s483 (s483-host-render-request): host calls on the render path
// and in `<request>` bodies (gaps g-boot-render-host-call-hang-s482, g-boot-request-host-call-s482;
// RULED S483, ruling:user-voice-scrml.md-S483-host-calls-render-request).
//
//   Q15: "both — (a) a run cap on the render queue now, matching the S482 effect cap, so no shape can
//        hang; (b) the compile-time refusal: a markup interpolation or derived formula that reaches
//        unproven host code (hostChain, with the `pureHostFile` stdlib allow-list) is refused, as
//        `<effect>` bodies already are."
//   Q14: "apply hostChain in requestPass — a `<request>` body reaching unproven host code is refused
//        like an `<effect>` body."
//
// Pinned here:
//   1. Q15 (b), the compile refusal — NOT built in this lane: it newly rejects 34 of the bootstrap's own
//      host tests (one-shot `<p>${f()}</p>` displays), so it is held for the owner (gap
//      g-boot-render-host-call-hang-s482; the built patch is docs/changes/s483-host-render-request/
//      q15b-as-ruled.patch, which also adds its tests here);
//   2. Q14 — a `<request>` body reaching unproven host code is E-REQUEST-WRITE-UNPROVEN (analyze.scrml
//      requestHostDiags) — probes F6 / F7 / G2 compiled on base and ran 100 times a click;
//   3. Q15 (a), the runtime backstop (happy-dom, the bootstrap runtime module): a render effect taken
//      from the render queue runs at most 100 times in one flush (`globalThis.__scrml_max_meta_runs`
//      overrides), logging the cycle once — on base the same drive never returned;
//   4. Chromium (SCRML_BROWSER_TESTS=1): probe F9's runtime shape (an interpolation whose glue clicks a
//      button whose handler writes the cell it reads) leaves the page responsive, the cap logged.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => d.code);
const errMsgs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`);

// probe F9's glue: clicks the button whose handler writes `@n`
const HOST = `<host src="./glue.js">\n  clickB() -> int\n</host>\n`;
const CK = "function ck() -> int { return clickB(); }";
const P = (body, pre = "", head = HOST) => `${head}<program>\n${CK}\n${pre}\nlet <n:int=0/>\n${body}\n<p id="c">\${@n}</p>\n<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>\n</program>\n`;
const refused = (code, src, ...needles) => {
  const r = run(src);
  expect(errs(r)).toEqual([code]);
  for (const n of needles) expect(errMsgs(r)[0]).toContain(n);
};
const clean = (r) => {
  expect(errMsgs(r)).toEqual([]);
  return r;
};

const MATH = `import { floor } from "scrml:math";\n`;
const stdRun = (src) => frontEndStdlib(mods, [{ path: "app.scrml", src }], "app.scrml");

// ---------------------------------------------------------------------------
// 2. Q14 — `<request>` bodies
// ---------------------------------------------------------------------------
describe("s483 Q14 — a `<request>` body reaching unproven host code is E-REQUEST-WRITE-UNPROVEN", () => {
  test("probe F6: through a wrapper, naming the chain", () => {
    refused("E-REQUEST-WRITE-UNPROVEN", P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = ck(); }</><b>\${@r}</b>`),
      "this `<request>` body calls `clickB()`, a `<host>`-backed function (§21.3.1), through `ck() → clickB()`",
      "a `<request>` body fails closed as an `<effect>` body does (§6.7.7)");
  });

  test("probe F7: a direct call", () => {
    refused("E-REQUEST-WRITE-UNPROVEN", P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = clickB(); }</><b>\${@r}</b>`), "this `<request>` body calls `clickB()`, a `<host>`-backed function (§21.3.1) —");
  });

  test("probe G2: a host call as a server function's argument", () => {
    refused("E-REQUEST-WRITE-UNPROVEN", P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = srv(ck()); }</><b>\${@r}</b>`, "server function srv(a: int) -> int { return a; }"), "through `ck() → clickB()`");
  });

  test("whatever the request's dependencies: a mount-only request is refused too", () => {
    refused("E-REQUEST-WRITE-UNPROVEN", P(`let <r:int=0/>\n<request id="rq" deps=[]>\${ @r = ck(); }</><b>\${@r}</b>`), "this `<request>` body calls `clickB()`");
  });

  test("`scrml:math` in a request body stays proven; a request calling no host function still compiles", () => {
    const src = `${MATH}<program>\nlet <n:int=0/>\nlet <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = floor(2.5) + @n; }</><b>\${@r}</b>\n<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>\n</program>\n`;
    expect(errMsgs(stdRun(src))).toEqual([]);
    clean(run(P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = inc(@n); }</><b>\${@r}</b>`, "function inc(x: int) -> int { return x + 1; }")));
  });
});

// ---------------------------------------------------------------------------
// 3. Q15 (a) — the render queue's run cap (the backstop)
// ---------------------------------------------------------------------------
let rt, dir;
let registered = false;
beforeAll(async () => {
  if (!globalThis.document) { GlobalRegistrator.register({ url: "http://localhost/" }); registered = true; }
  dir = mkdtempSync(join(tmpdir(), "s483-host-render-rt-"));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  rt = await import(join(dir, "scrml-runtime.js"));
}, { timeout: 60000 });
afterAll(async () => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  if (registered) { await GlobalRegistrator.unregister(); registered = false; }
});

describe("s483 Q15 (a) — the render queue's run cap", () => {
  test("a render effect whose run writes the cell it reads (below the compiler's refusal) stops at 100 runs in one flush and logs the cycle once", () => {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    let runs = 0;
    let armed = false;
    try {
      rt.effect(scope, () => { runs++; const v = n.get(); if (armed) n.set(v + 1); });
      expect(runs).toBe(1);                          // the mount run
      armed = true;
      runs = 0;
      const t0 = Date.now();
      n.set(1);                                      // the click
      expect(Date.now() - t0).toBeLessThan(5000);
      expect(runs).toBe(100);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain("[scrml] render effect exceeded 100 runs in one update — possible infinite loop");
      runs = 0;
      n.set(1000);                                   // the next flush counts afresh
      expect(runs).toBe(100);
      expect(logged.length).toBe(2);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("the cap is `globalThis.__scrml_max_meta_runs`; two render effects writing each other's reads settle too", () => {
    const scope = rt.root.child();
    const a = rt.cell(0);
    const b = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...x) => logged.push(x.join(" "));
    globalThis.__scrml_max_meta_runs = 5;
    let armed = false;
    try {
      rt.effect(scope, () => { const v = a.get(); if (armed) b.set(v + 1); });
      rt.effect(scope, () => { const v = b.get(); if (armed) a.set(v + 1); });
      armed = true;
      a.set(1);
      expect(logged.length).toBeGreaterThan(0);
      expect(logged[0]).toContain("render effect exceeded 5 runs");
      expect(a.get()).toBeLessThan(20);
    } finally {
      delete globalThis.__scrml_max_meta_runs;
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("a render effect that writes no cell runs once per change, as before (no log)", () => {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    const seen = [];
    try {
      rt.effect(scope, () => { seen.push(n.get()); });
      for (let i = 1; i <= 150; i++) n.set(i);       // 150 flushes, one run each
      expect(seen.length).toBe(151);                 // the mount run + 150
      expect(logged).toEqual([]);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });
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
  cdir = mkdtempSync(join(tmpdir(), "s483-host-render-chromium-"));
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

suite("s483 host-render-request — Chromium", () => {
  test("probe F9's shape (an interpolation whose glue clicks a button whose handler writes the cell it reads) leaves the page responsive, the cap logged", async () => {
    // the probe cannot compile any more; its runtime shape is written against the runtime directly
    writeFileSync(join(cdir, "f9.html"), `<!doctype html><html><body><p id="o"></p><p id="c"></p><button id="b">b</button><button id="go">go</button>
<script type="module">
import * as rt from "./scrml-runtime.js";
const n = rt.cell(0);
const scope = rt.root.child();
let armed = false;
function clickB() { if (armed) document.getElementById("b").click(); return 0; }
rt.effect(scope, () => { document.querySelector("#o").textContent = String(clickB() + n.get()); });
document.querySelector("#b").addEventListener("click", () => { n.set(n.get() + 1); document.querySelector("#c").textContent = String(n.get()); });
document.querySelector("#go").addEventListener("click", () => { armed = true; n.set(n.get() + 1); });
document.body.dataset.ready = "1";
</script></body></html>`);
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/f9.html`);
    await page.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 10000 });
    page.click("#go").catch(() => {});
    const t = await Promise.race([
      (async () => {
        await new Promise((r) => setTimeout(r, 300));
        return await page.evaluate(() => "responsive " + document.querySelector("#c").textContent);
      })(),
      new Promise((r) => setTimeout(() => r("PAGE UNRESPONSIVE after 8s"), 8000)),
    ]);
    // the go click, then 100 render runs each clicking #b once
    expect(t).toBe("responsive 101");
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("[scrml] render effect exceeded 100 runs in one update");
    await page.close();
  }, 60000);
});
