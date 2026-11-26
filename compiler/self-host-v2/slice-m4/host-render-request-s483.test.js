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
//   1. Q15 (b), the compile refusal — ruled, NOT built in this lane: it newly rejects 34 of the bootstrap's
//      own host tests (one-shot `<p>${f()}</p>` displays); queued as lane s483-q15b-pure-marker (gap
//      g-boot-render-host-call-hang-s482), whose patch adds its tests here;
//   2. Q14 — a `<request>` body reaching unproven host code is E-REQUEST-WRITE-UNPROVEN (analyze.scrml
//      requestHostDiags) — probes F6 / F7 / G2 compiled on base and ran 100 times a click;
//   3. Q15 (a), the runtime backstop (happy-dom, the bootstrap runtime module): a render effect taken
//      from the render queue runs at most 100 times in one flush (`globalThis.__scrml_max_meta_runs`
//      overrides), logging the cycle once — on base the same drive never returned; and (s483 fix r1,
//      review HIGH-1) the same bound ACROSS flushes: a loop that laps through a request's settle (a new
//      flush each lap) stops at 100 laps of its own chain of causes, logged once, while a long chain of
//      different runs, and a loop whose laps yield to the event loop, are not capped;
//   4. Chromium (SCRML_BROWSER_TESTS=1), the COMPILED programs: probe F9 (p-R1_interp — an
//      interpolation whose glue clicks a button whose handler writes the cell it reads) and probe R10
//      (p-R10_req_settle — the same loop through a `<request>`'s settle) leave the page responsive,
//      the cap logged once.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
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

const macrotask = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("s483 fix r1 — the cap across flushes (a loop through a request's settle, review HIGH-1)", () => {
  // probe R10's runtime shape: a render effect reads `r` and (the host glue's click) writes `n`; a
  // request on `n` sets `r` when it settles — a microtask, so every lap is a NEW flush, and the
  // per-flush caps never see more than one run of either
  async function lapLoop(drive) {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const r = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    let runs = 0;
    let armed = false;
    try {
      rt.requestOn(scope, r, [n], () => ({ on: n.peek() + 1, then: (v) => { r.set(v); } }));
      rt.effect(scope, () => { runs++; r.get(); if (armed) n.set(n.peek() + 1); });
      await macrotask();                             // the mount run settles
      armed = true;
      await drive({ n, r, logged, runs: () => runs, reset: () => { runs = 0; } });
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  }

  test("a loop lapping through a request's settle stops at 100 laps and logs once; after the page yields, a write starts afresh", async () => {
    await lapLoop(async ({ n, r, logged, runs, reset }) => {
      reset();
      n.set(n.peek() + 1);                           // the click
      await macrotask(20);                           // before the lap cap the microtask chain never yielded: this never resolved
      // the click ran the request first, so the request is the run that reaches lap 101 first
      expect(runs()).toBe(100);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain("[scrml] <request> exceeded 100 runs in one chain of updates that never yielded to the event loop");
      expect(r.peek()).toBe(n.peek());               // the 101st request run was skipped: its settle never came
      reset();
      n.set(n.peek() + 1);                           // the page yielded: a fresh chain, counted afresh
      await macrotask(20);
      expect(runs()).toBe(100);
      expect(logged.length).toBe(2);
    });
  });

  test("started from the render side (probe R10's direction: the render's glue writes first), the render effect is the run stopped", async () => {
    await lapLoop(async ({ n, r, logged, runs, reset }) => {
      reset();
      r.set(-1);                                     // a write the render reads: it runs first in the chain
      await macrotask(20);
      expect(runs()).toBe(100);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain("[scrml] render effect exceeded 100 runs in one chain of updates that never yielded to the event loop");
      expect(r.peek()).toBe(n.peek() + 1);           // the request's last settle landed; the 101st render was skipped
    });
  });

  test("the bound is `globalThis.__scrml_max_meta_runs`, as the per-flush caps'", async () => {
    globalThis.__scrml_max_meta_runs = 7;
    try {
      await lapLoop(async ({ n, logged, runs, reset }) => {
        reset();
        n.set(n.peek() + 1);
        await macrotask(20);
        expect(runs()).toBe(7);
        expect(logged.length).toBe(1);
        expect(logged[0]).toContain("<request> exceeded 7 runs in one chain of updates");
      });
    } finally {
      delete globalThis.__scrml_max_meta_runs;
    }
  });

  test("a chain of 120 DIFFERENT requests, each on the last one's target, with one interpolation reading them all: no cap, every value", async () => {
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    try {
      const n = rt.cell(0);
      const rs = [];
      let prev = n;
      for (let i = 0; i < 120; i++) {
        const t = rt.cell(0);
        const dep = prev;
        rt.requestOn(scope, t, [dep], () => ({ on: dep.peek() + 1, then: (v) => { t.set(v); } }));
        rs.push(t);
        prev = t;
      }
      let shown = null;
      let renders = 0;
      rt.effect(scope, () => { renders++; shown = rs.reduce((a, c) => a + c.get(), 0); });
      await macrotask(20);
      expect(shown).toBe((120 * 121) / 2);           // r_i = i
      renders = 0;
      n.set(1);
      await macrotask(20);
      expect(shown).toBe((120 * 121) / 2 + 120);     // r_i = i + 1
      expect(renders).toBeGreaterThan(100);          // a re-render per settle, past the bound: different causes each time
      expect(logged).toEqual([]);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("a loop whose laps yield to the event loop (a result that arrives in a later task) is not capped", async () => {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const r = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    let runs = 0;
    let armed = false;
    try {
      rt.requestOn(scope, r, [n], () => {
        const v = n.peek() + 1;
        return { on: new Promise((res) => setTimeout(() => res(v), 0)), then: (x) => { r.set(x); } };
      });
      rt.effect(scope, () => { runs++; r.get(); if (armed && n.peek() < 150) n.set(n.peek() + 1); });
      await macrotask(20);
      armed = true;
      runs = 0;
      n.set(n.peek() + 1);
      for (let i = 0; i < 400 && r.peek() < 151; i++) await macrotask(1);
      expect(n.peek()).toBe(150);                    // 150 laps, each through a later task
      expect(r.peek()).toBe(151);
      expect(runs).toBeGreaterThanOrEqual(149);
      expect(logged).toEqual([]);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Chromium (SCRML_BROWSER_TESTS=1; SCRML_CHROMIUM names the binary) — the COMPILED probes
// ---------------------------------------------------------------------------
const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const suite = ON ? describe : describe.skip;
const PBASE = join(homedir(), ".cache", "scrml-agent-tmp", "host-render-request-s483");
// the reviewer's probe glue (p-R1_interp, p-R10_req_settle): every call clicks #b
const GLUE = "export function clickB() { const b = document.getElementById('b'); if (b) b.click(); return 0; }\n";
const PROBES = {
  // probe F9 (p-R1_interp): an interpolation whose glue clicks a button whose handler writes the cell it reads
  f9: P(`<p id="o">\${ck() + @n}</p>`),
  // probe R10 (p-R10_req_settle): the same loop through a `<request>`'s settle — a new flush each lap
  r10: P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = @n + 1; }</>\n<p id="o">\${ck() + @r}</p>`),
};
let browser, server, cdir, port;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  mkdirSync(PBASE, { recursive: true });
  cdir = mkdtempSync(join(PBASE, "t-"));
  const { compileFile } = await import("../../../scripts/scrml-boot.ts");
  for (const [name, src] of Object.entries(PROBES)) {
    const d = join(cdir, name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "scrml.toml"), "");
    writeFileSync(join(d, "glue.js"), GLUE);
    writeFileSync(join(d, "app.scrml"), src);
    const r = await compileFile(join(d, "app.scrml"), { outDir: join(d, "dist") });
    const bad = r.diagnostics.filter((x) => x.severity === "error").map((x) => `${x.code}: ${x.message}`);
    if (bad.length > 0) throw new Error(`probe ${name} did not compile: ${bad.join("; ")}`);
  }
  server = createServer((req, res) => {
    const p = new URL(req.url, "http://localhost").pathname;
    if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    const [, name, ...rest] = p.split("/");
    const f = join(cdir, name ?? "", "dist", rest.join("/") || "index.html");
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const { default: puppeteer } = await import("puppeteer");
  browser = await puppeteer.launch({ executablePath: BIN, headless: true, args: ["--no-sandbox"] });
}, { timeout: 300000 });
afterAll(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  if (cdir) rmSync(cdir, { recursive: true, force: true });
});

/**
 * Load the compiled probe, read #c, click #b, and report whether the page answers within 8s: #c
 * before and after, and the errors logged during the load and after the click.
 */
async function clickProbe(name) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror " + e.message));
  await page.goto(`http://127.0.0.1:${port}/${name}/`);
  await page.waitForSelector("#c", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  const before = Number(await page.evaluate(() => document.querySelector("#c").textContent));
  const atLoad = errors.splice(0);
  page.click("#b").catch(() => {});
  const t = await Promise.race([
    (async () => {
      await new Promise((r) => setTimeout(r, 500));
      return Number(await page.evaluate(() => document.querySelector("#c").textContent));
    })(),
    new Promise((r) => setTimeout(() => r("PAGE UNRESPONSIVE after 8s"), 8000)),
  ]);
  page.close().catch(() => {});
  return { before, atLoad, clicks: typeof t === "number" ? t - before : t, errors };
}

suite("s483 host-render-request — Chromium, the compiled probes", () => {
  test("probe F9 (p-R1_interp, compiled): the page stays responsive, the cap logged once", async () => {
    const { before, atLoad, clicks, errors } = await clickProbe("f9");
    expect(before).toBe(0);                          // the mount run clicked before the handler was bound
    expect(atLoad).toEqual([]);
    // the click, then 100 render runs each clicking #b once
    expect(clicks).toBe(101);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("[scrml] render effect exceeded 100 runs in one update");
  }, 60000);

  test("probe R10 (p-R10_req_settle, compiled — the loop laps through a `<request>`'s settle): the page stays responsive, the cap logged once per loop", async () => {
    const { before, atLoad, clicks, errors } = await clickProbe("r10");
    // The request's MOUNT settle re-runs the interpolation with the handler bound: a loop already, at
    // load — capped, and logged once. The click starts a second: its flush meets the per-flush cap
    // (the handler's read subscribes the interpolation to `@n`); the request carries the chain into
    // its settle's flush, where the lap cap stops it, not logged a second time. Before the lap cap:
    // PAGE UNRESPONSIVE (the microtask chain never yielded), the cap logged on every lap.
    expect(before).toBe(100);
    expect(atLoad.length).toBe(1);
    expect(atLoad[0]).toContain("[scrml] render effect exceeded 100 runs in one update");
    expect(clicks).toBe(101);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("[scrml] render effect exceeded 100 runs in one update");
  }, 60000);
});
