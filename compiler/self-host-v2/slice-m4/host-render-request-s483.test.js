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
//      overrides), logging the cycle once — on base the same drive never returned; and (s483 fix r2,
//      RULED S483, ruling:user-voice-scrml.md-S483-render-bound-time, "Time without yielding") the
//      stall bound ACROSS flushes: once the page has gone RENDER_STALL_MS (1000 ms;
//      `globalThis.__scrml_render_stall_ms` overrides) without yielding, a render effect's re-run is
//      skipped and the stall logged once, whether the loop's writes are caused (a request's settle) or
//      not (a microtask); a finite chain of any number of laps that finishes inside the bound, a long
//      chain of different runs, and a loop whose laps yield, all complete (the r1 lap cap stopped the
//      first and the last at 100);
//   4. Chromium (SCRML_BROWSER_TESTS=1), the COMPILED programs: probe F9 (p-R1_interp — an
//      interpolation whose glue clicks a button whose handler writes the cell it reads), probe R10
//      (p-R10_req_settle — the same loop through a `<request>`'s settle) and probe X2 (the glue's own
//      microtask writes) leave the page responsive, one log per stall; probe P5 (a finite 299-step
//      chain through `if=` arm remounts, no host code) completes as on base; probe P6 (the same ring
//      without a limit) is bounded.

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
  test("a render effect whose run writes the cell it reads (below the compiler's refusal) stops at 100 runs in one flush and logs the cycle once", async () => {
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
      // s483 r2: logged once per effect until the page yields (a loop that laps through a request
      // meets the cap in every lap's flush; it is reported once, not once a lap)
      expect(logged.length).toBe(1);
      await new Promise((r) => setTimeout(r, 5));    // the page yields
      runs = 0;
      n.set(2000);
      expect(runs).toBe(100);
      expect(logged.length).toBe(2);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("the cap is `globalThis.__scrml_max_meta_runs`; two render effects writing each other's reads settle too", async () => {
    await new Promise((r) => setTimeout(r, 5));      // the page yields: the last test's report is behind it (one per stall)
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

describe("s483 fix r2 — the stall bound (RULED S483, ruling:user-voice-scrml.md-S483-render-bound-time)", () => {
  // probe R10's runtime shape: a render effect reads `r` and (the host glue's click) writes `n`; a
  // request on `n` sets `r` when it settles — a microtask, so every lap is a NEW flush, and the
  // per-flush caps never see more than one run of either. The microtask chain never lets the page
  // yield: before the stall bound it hung.
  async function lapLoop(drive, { stallMs = 50 } = {}) {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const r = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    if (stallMs !== null) globalThis.__scrml_render_stall_ms = stallMs;
    let runs = 0;
    let armed = false;
    try {
      rt.requestOn(scope, r, [n], () => ({ on: n.peek() + 1, then: (v) => { r.set(v); } }));
      rt.effect(scope, () => { runs++; r.get(); if (armed) n.set(n.peek() + 1); });
      await macrotask();                             // the mount run settles
      armed = true;
      await drive({ n, r, logged, runs: () => runs, reset: () => { runs = 0; } });
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  }
  const STALL_LOG = "[scrml] render effects stopped: the page has gone ";

  test("a loop lapping through a request's settle stops once the page has gone the bound without yielding, logged once; after the page yields, a write runs again", async () => {
    await lapLoop(async ({ n, r, logged, runs, reset }) => {
      reset();
      const t0 = performance.now();
      n.set(n.peek() + 1);                           // the click
      await macrotask();                             // before the stall bound the microtask chain never yielded: this never resolved
      const ms = performance.now() - t0;
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThan(5000);
      expect(runs()).toBeGreaterThan(100);           // not a lap count: the r1 lap cap stopped this at 100
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG + "50 ms without yielding to the browser");
      expect(r.peek()).toBe(n.peek() + 1);           // the request's last settle landed; the render re-run was skipped
      reset();
      n.set(n.peek() + 1);                           // the page yielded: render effects run again
      await macrotask();
      expect(runs()).toBeGreaterThan(100);
      expect(logged.length).toBe(2);                 // once per stall
    });
  });

  test("the bound is RENDER_STALL_MS, 1000 ms by default (`globalThis.__scrml_render_stall_ms` overrides)", async () => {
    await lapLoop(async ({ n, logged, runs, reset }) => {
      reset();
      const t0 = performance.now();
      n.set(n.peek() + 1);
      await macrotask();
      const ms = performance.now() - t0;
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThan(10000);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG + "1000 ms without yielding");
      expect(runs()).toBeGreaterThan(100);
    }, { stallMs: null });
  }, 30000);

  test("a FINITE chain of 150 laps through one render effect, every lap a microtask (review r1 HIGH-1: P5, rowmount150), completes: every value, no log", async () => {
    // a render effect mounts, for each new row, a row request whose settle appends the next row (an
    // infinite-load sentinel whose answer is already available)
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    try {
      const xs = rt.cell([0]);
      const mounted = new Set();
      let renders = 0;
      let shownLen = 0;
      rt.effect(scope, () => {
        renders++;
        const v = xs.get();
        shownLen = v.length;
        for (const i of v) {
          if (mounted.has(i)) continue;
          mounted.add(i);
          const t = rt.cell(0);
          rt.requestOn(scope.child(), t, [], () => ({ on: i, then: (k) => { t.set(k); if (k + 1 < 150) xs.set([...xs.peek(), k + 1]); } }));
        }
      });
      await macrotask(20);
      expect(xs.peek().length).toBe(150);
      expect(shownLen).toBe(150);
      expect(renders).toBe(150);
      expect(logged).toEqual([]);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("an uncaused write stream bounds the same way (probe X2's shape: the render's own microtask writes what it reads) — one principle for caused and uncaused writes", async () => {
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    globalThis.__scrml_render_stall_ms = 50;
    try {
      const n = rt.cell(0);
      let runs = 0;
      let armed = false;
      rt.effect(scope, () => { runs++; n.get(); if (armed) queueMicrotask(() => n.set(n.peek() + 1)); });
      armed = true;
      n.set(1);
      const res = await Promise.race([macrotask().then(() => "yielded"), new Promise((x) => setTimeout(() => x("hung"), 10000))]);
      expect(res).toBe("yielded");
      expect(runs).toBeGreaterThan(100);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG);
      armed = false;
      runs = 0;
      n.set(-1);                                     // after the yield: runs as usual
      expect(runs).toBe(1);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("only a RE-run is skipped: a render effect mounted past the bound still runs its first run; after the yield, every one runs", async () => {
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    globalThis.__scrml_render_stall_ms = 0;          // past the bound as soon as a watch begins
    try {
      const a = rt.cell(0);
      let runsA = 0;
      let runsB = 0;
      rt.effect(scope, () => { runsA++; a.get(); }); // the mount run
      await macrotask();
      a.set(1);                                      // a flush: a watch begins; A's first run in it runs
      expect(runsA).toBe(2);
      a.set(2);                                      // a re-run during the same watch, past the bound: skipped
      expect(runsA).toBe(2);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG + "0 ms");
      rt.effect(scope, () => { runsB++; a.get(); }); // a mount during the stall: its first run runs
      expect(runsB).toBe(1);
      await macrotask(5);                            // the page yields
      a.set(3);                                      // a new watch: each effect's first run in it runs
      expect(runsA).toBe(3);
      expect(runsB).toBe(2);
      expect(logged.length).toBe(1);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("a chain of 120 DIFFERENT requests, each on the last one's target, with one interpolation reading them all: no bound, every value", async () => {
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
      expect(renders).toBeGreaterThan(100);          // a re-render per settle
      expect(logged).toEqual([]);
    } finally {
      console.error = savedErr;
      scope.dispose();
    }
  });

  // a loop of 150 laps, each answer from `answer(v)` — a later task of some kind
  async function yieldingLoop(answer, after = async () => { await macrotask(1); }) {
    const scope = rt.root.child();
    const n = rt.cell(0);
    const r = rt.cell(0);
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    let runs = 0;
    let armed = false;
    try {
      rt.requestOn(scope, r, [n], () => { const v = n.peek() + 1; return { on: answer(v), then: (x) => { r.set(x); } }; });
      rt.effect(scope, () => { runs++; r.get(); if (armed && n.peek() < 150) n.set(n.peek() + 1); });
      for (let i = 0; i < 5; i++) await after();
      armed = true;
      runs = 0;
      n.set(n.peek() + 1);
      for (let i = 0; i < 600 && r.peek() < 151; i++) await after();
      expect(n.peek()).toBe(150);
      expect(r.peek()).toBe(151);
      expect(runs).toBeGreaterThanOrEqual(149);
      expect(logged).toEqual([]);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  }

  test("a loop whose laps yield — answers through setTimeout, setImmediate or a MessageChannel — completes: 150 laps, no log (review r1 MED-1: the r1 lap cap stopped them at 100)", async () => {
    await yieldingLoop((v) => new Promise((res) => setTimeout(() => res(v), 0)));
    await yieldingLoop((v) => new Promise((res) => setImmediate(() => res(v))));
    const mc = new MessageChannel();
    const waiting = [];
    mc.port1.onmessage = () => { const f = waiting.shift(); if (f) f(); };
    try {
      await yieldingLoop((v) => new Promise((res) => { waiting.push(() => res(v)); mc.port2.postMessage(0); }));
    } finally {
      mc.port1.close();
    }
  }, 30000);

  test("a fake clock installed after the runtime loaded, advanced by the test between microtask awaits, does not trip it (review r1 MED-1)", async () => {
    const realST = globalThis.setTimeout;
    const fakeQ = [];
    const fakeST = (f) => { fakeQ.push(f); return fakeQ.length; };
    globalThis.setTimeout = fakeST;
    try {
      // each lap's answer is a fake timer; the test fires them and awaits microtasks only (the
      // jest / sinon pattern): the whole chain finishes well inside the bound, so it completes
      await yieldingLoop(
        (v) => new Promise((res) => fakeST(() => res(v))),
        async () => {
          for (const f of fakeQ.splice(0)) f();
          for (let i = 0; i < 20; i++) await Promise.resolve();
        },
      );
    } finally {
      globalThis.setTimeout = realST;
    }
  }, 30000);
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
// probe X2's glue (p-X2_glue_microtask): the click comes from the glue's OWN microtask
const GLUE_X2 = "export function clickB() { queueMicrotask(() => { const b = document.getElementById('b'); if (b) b.click(); }); return 0; }\n";
// probes P5 / P6 (review r1): an `if=` / `else` pair whose arms each hold a mount request advancing the other
// arm's condition — no host code; P5 stops at 150, P6 never stops (a request ring through arm mounts)
const IF_STEPS = (adv, test) => `<program>\nfunction adv(s: int) -> int { return ${adv}; }\nlet <sa:int=0/>\nlet <sb:int=0/>\n` +
  `<div if=\${${test}}><request id="ea" deps=[]>\${ @sa = adv(@sb); }</>even</div>\n` +
  `<div else>odd<request id="eb" deps=[]>\${ @sb = adv(@sa); }</></div>\n` +
  `<p id="o">\${@sa + @sb}</p>\n<p id="c">\${@sb}</p>\n<button id="b" onclick=\${() => { @sa = 0; @sb = 0; }}>b</button>\n</program>\n`;
const PROBES = {
  // probe F9 (p-R1_interp): an interpolation whose glue clicks a button whose handler writes the cell it reads
  f9: { src: P(`<p id="o">\${ck() + @n}</p>`), glue: GLUE },
  // probe R10 (p-R10_req_settle): the same loop through a `<request>`'s settle — a new flush each lap
  r10: { src: P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = @n + 1; }</>\n<p id="o">\${ck() + @r}</p>`), glue: GLUE },
  // probe X2 (p-X2_glue_microtask): the loop's writes come from the glue's own microtask
  x2: { src: P(`<p id="o">\${ck() + @n}</p>`), glue: GLUE_X2 },
  p5: { src: IF_STEPS("s < 150 ? s + 1 : s", "@sa <= @sb && @sb < 150"), glue: null },
  p6: { src: IF_STEPS("s + 1", "@sa <= @sb"), glue: null },
};
const STALL = "[scrml] render effects stopped: the page has gone 1000 ms without yielding to the browser";
let browser, server, cdir, port;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  mkdirSync(PBASE, { recursive: true });
  cdir = mkdtempSync(join(PBASE, "t-"));
  const { compileFile } = await import("../../../scripts/scrml-boot.ts");
  for (const [name, { src, glue }] of Object.entries(PROBES)) {
    const d = join(cdir, name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "scrml.toml"), "");
    if (glue !== null) writeFileSync(join(d, "glue.js"), glue);
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
async function clickProbe(name, { expectLog = true, loadLog = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror " + e.message));
  await page.goto(`http://127.0.0.1:${port}/${name}/`);
  await page.waitForSelector("#c", { timeout: 10000 });
  for (let i = 0; i < 30 && (i < 3 || (loadLog && errors.length === 0)); i++) await new Promise((r) => setTimeout(r, 100));
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
  const o = typeof t === "number" ? Number(await page.evaluate(() => document.querySelector("#o")?.textContent)) : null;
  // console messages arrive over CDP after the page answers; a loop the click started reports once
  for (let i = 0; i < 30 && (i < 3 || (expectLog && errors.length === 0)); i++) await new Promise((r) => setTimeout(r, 100));
  page.close().catch(() => {});
  return { before, atLoad, clicks: typeof t === "number" ? t - before : t, errors, o };
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

  test("probe R10 (p-R10_req_settle, compiled — the loop laps through a `<request>`'s settle): the page stays responsive, the loop reported once per stall", async () => {
    const { before, atLoad, clicks, errors } = await clickProbe("r10", { loadLog: true });
    // The request's MOUNT settle re-runs the interpolation with the handler bound: a loop already, at
    // load. Each lap's flush meets the per-flush cap (the handler's read subscribes the interpolation to
    // `@n`), logged once; the request carries the loop into its settle's flush, lap after lap, until the
    // page has gone RENDER_STALL_MS without yielding — then the stall bound skips the render's re-run,
    // not logged a second time. The click starts another. Before r1: PAGE UNRESPONSIVE, the cap logged on
    // every lap; under the r1 lap cap it stopped at 100 laps (before = 100). How many laps fit in the
    // bound depends on the machine (the ruling accepts a timing-dependent trip point).
    expect(before).toBeGreaterThan(100);
    expect(atLoad.length).toBe(1);
    expect(atLoad[0]).toContain("[scrml] render effect exceeded 100 runs in one update");
    expect(typeof clicks).toBe("number");
    expect(clicks).toBeGreaterThan(101);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("[scrml] render effect exceeded 100 runs in one update");
  }, 60000);

  test("probe X2 (p-X2_glue_microtask, compiled — the glue writes from its own microtask): the page loads and stays responsive, one log per stall", async () => {
    // on base and under the r1 lap cap the page never finished loading
    const { before, atLoad, clicks, errors } = await clickProbe("x2", { loadLog: true });
    expect(before).toBeGreaterThan(100);
    expect(atLoad.length).toBe(1);
    expect(atLoad[0]).toContain(STALL);
    expect(typeof clicks).toBe("number");
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain(STALL);
  }, 60000);

  test("probe P5 (review r1 HIGH-1, compiled, no host code — a finite 299-step chain through `if=` arm remounts) completes, as on base: o=299, no log", async () => {
    const { before, atLoad, clicks, errors, o } = await clickProbe("p5", { expectLog: false });
    expect(before).toBe(150);
    expect(atLoad).toEqual([]);
    expect(clicks).toBe(0);                          // the click resets both cells and the chain runs again to 150
    expect(o).toBe(299);
    expect(errors).toEqual([]);
  }, 60000);

  test("probe P6 (compiled, no host code — a request ring through `if=` arm remounts the analyzer does not refuse): bounded, the page loads and stays responsive, one log per stall", async () => {
    // on base the page never finished loading (gap g-boot-request-ring-if-arm-s483)
    const { before, atLoad, clicks, errors, o } = await clickProbe("p6", { loadLog: true });
    expect(before).toBeGreaterThan(100);
    expect(atLoad.length).toBe(1);
    expect(atLoad[0]).toContain(STALL);
    expect(typeof clicks).toBe("number");
    // The click sets both cells to 0, so the `if=` test is true. Where the stall left the "odd" arm
    // mounted, the test turning true remounts "even" and the ring runs again — until the next stall,
    // logged once. Where it left "even" mounted (its skipped re-run never swapped the arms), nothing
    // remounts, no request runs, and the page shows 0. Which arm the stall leaves depends on timing.
    if (errors.length === 0) {
      expect(o).toBe(0);
      expect(clicks).toBe(-before);
    } else {
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain(STALL);
    }
  }, 60000);
});
