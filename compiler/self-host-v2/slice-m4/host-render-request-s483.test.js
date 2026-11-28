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
//      without a limit) is bounded;
//   5. s483 fix r3 (review r2): a runtime `^{}` block is under the same stall bound (pa-ruled:
//      S483-render-bound-covers-markup-meta; probes M1 / M1c — a `^{}` + `<request>` ring that froze the
//      page at load); a re-run is skipped only past STALL_MIN_RERUNS (3) re-runs in the watch AND the time
//      bound (probes loading_forever / M2b, a fake clock installed before load); every skipped effect runs
//      again once the page yields, and a loop that run restarts is stopped at its first re-run; the clock
//      is read at each update's start (slow laps stop about the bound in); a MessageChannel that never
//      delivers falls back to the load-time setTimeout.
//   6. s483 fix r4 (review r3): a rendering opportunity (`requestAnimationFrame`) ends a watch, so a page
//      that yields between tasks but falls behind a task backlog is not a stall (probe stream); a retry
//      whose re-run is skipped runs once more about the bound later, so a late write is never lost
//      (probes taskwrite / taskreq) and a real loop laps about once per bound; past twice the bound an
//      effect's second re-run is skipped whatever the count (probe slow_rerun).

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

  test("a loop lapping through a request's settle stops once the page has gone the bound without yielding, logged once; after the page yields, a write runs again (r5: the loop it restarts is not given another bound)", async () => {
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
      n.set(n.peek() + 1);                           // the page yielded: the write runs the render again
      await macrotask();
      expect(runs()).toBeGreaterThanOrEqual(1);
      // s483 r5 (#2123 r4 review HIGH-1): the render was skipped in the last watch it ran in, so it is still
      // a stopped loop — the write runs it, and the loop that run restarts is stopped at its next re-run
      // (r2–r4: another full bound, frozen again and logged again — with two drivers, without end)
      expect(runs()).toBeLessThan(10);
      expect(logged.length).toBe(1);                 // the stall is reported once
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

  test("only a RE-run past the count is skipped: a render effect mounted past the bound still runs its first run; after the yield, every one runs", async () => {
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
      a.set(2);                                      // s483 r3: up to STALL_MIN_RERUNS (3) re-runs in a
      a.set(3);                                      // watch run whatever the clock says
      a.set(4);
      expect(runsA).toBe(5);
      expect(logged).toEqual([]);
      a.set(5);                                      // a 4th re-run during the same watch, past the bound: skipped
      expect(runsA).toBe(5);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG + "0 ms");
      rt.effect(scope, () => { runsB++; a.get(); }); // a mount during the stall: its first run runs
      expect(runsB).toBe(1);
      await macrotask(5);                            // the page yields: A's skipped run runs (s483 r3)
      expect(runsA).toBe(6);
      a.set(6);                                      // a new watch: each effect's first run in it runs
      expect(runsA).toBe(7);
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
// 3b. s483 fix r3 — the stall bound, review r2's findings
// ---------------------------------------------------------------------------
describe("s483 fix r3 — the stall bound: runtime `^{}` blocks, the re-run count, the re-run on the yield", () => {
  const STALL_LOG = "[scrml] render effects stopped: the page has gone ";
  const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* spin */ } };

  // console.error captured, `__scrml_render_stall_ms` set, a scope disposed at the end
  async function withStall(stallMs, fn) {
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    if (stallMs !== null) globalThis.__scrml_render_stall_ms = stallMs;
    try {
      await fn(scope, logged);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  }

  // A FRESH runtime module, loaded after `setup()` replaced host globals (a fake clock, a dead
  // MessageChannel) — the runtime binds them at load. `teardown()` puts them back.
  async function freshRuntime(tag, setup, teardown, fn) {
    const d = mkdtempSync(join(tmpdir(), "s483-r3-" + tag + "-"));
    copyFileSync(RUNTIME, join(d, "scrml-runtime.js"));
    setup();
    let fresh;
    try {
      fresh = await import(join(d, "scrml-runtime.js"));
    } catch (err) {
      teardown();
      throw err;
    }
    const scope = fresh.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    try {
      await fn(fresh, scope, logged);
    } finally {
      console.error = savedErr;
      teardown();
      scope.dispose();
      delete globalThis.__scrml_render_stall_ms;
      rmSync(d, { recursive: true, force: true });
    }
  }

  test("HIGH-1 (probe M1, pa-ruled:S483-render-bound-covers-markup-meta): a runtime `^{}` block's ring through a `<request>` (`meta.set` of the request's dependency) is bounded by the same stall bound, logged once", async () => {
    await withStall(50, async (scope, logged) => {
      const n = rt.cell(0);
      const r = rt.cell(0);
      let runs = 0;
      rt.requestOn(scope, r, [n], () => ({ on: n.peek() + 1, then: (v) => { r.set(v); } }));
      // the compiled `^{ meta.set("n", meta.get("r")); }`: every lap is the request's settle (a
      // microtask) re-running the block — a new flush each lap, below the block's per-flush cap.
      // Before r3 the block was outside the stall bound and the page never finished loading.
      rt.metaEffect(scope, document.createElement("div"), "m1", (task, meta) => {
        runs++;
        n.set(meta.get(() => r.get()));
      });
      const res = await Promise.race([macrotask(20).then(() => "yielded"), new Promise((x) => setTimeout(() => x("hung"), 10000))]);
      expect(res).toBe("yielded");
      expect(runs).toBeGreaterThan(100);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG + "50 ms without yielding");
      const settled = runs;
      await macrotask(30);
      expect(runs).toBe(settled);                    // stopped: the re-run on the yield does not restart it for good
      expect(logged.length).toBe(1);
    });
  }, 30000);

  test("HIGH-1: a `^{}` block's first run always runs, and a block re-run a few times in a slow stretch is not skipped", async () => {
    await withStall(0, async (scope, logged) => {
      const a = rt.cell(0);
      let runs = 0;
      rt.metaEffect(scope, document.createElement("div"), "m2", (task, meta) => { runs++; meta.get(() => a.get()); });
      expect(runs).toBe(1);
      await macrotask();
      for (let i = 1; i <= 4; i++) a.set(i);         // its first run in the watch + 3 re-runs: all run
      expect(runs).toBe(5);
      a.set(5);                                      // a 4th re-run, past the bound: skipped
      expect(runs).toBe(5);
      expect(logged.length).toBe(1);
      await macrotask(5);                            // the page yields: the skipped run runs
      expect(runs).toBe(6);
    });
  });

  test("MED-1 (probe loading_forever / M2b): one slow update that re-runs a display once or twice is not a loop — the display shows the cell, no log", async () => {
    await withStall(0, async (scope, logged) => {
      // the click sets a "loading" flag; a settle starts a heavy render; another settle clears the flag.
      // The flag's display re-runs once in the stretch — under r2 that re-run was skipped (the stretch
      // was past the bound) and never run again: "Loading" for good.
      const loading = rt.cell(false);
      const list = rt.cell(0);
      let shown = "";
      rt.effect(scope, () => { shown = loading.get() ? "Loading" : "Done"; });
      rt.effect(scope, () => { if (list.get() > 0) busy(5); });
      await macrotask();
      loading.set(true);
      await Promise.resolve().then(() => list.set(1));
      await Promise.resolve().then(() => loading.set(false));
      expect(shown).toBe("Done");
      expect(logged).toEqual([]);
    });
  });

  test("MED-1: a synchronous write, a busy stretch, a write — no batch (review r2 sync_handler_busy) — shows the last value", async () => {
    await withStall(0, async (scope, logged) => {
      const st = rt.cell("idle");
      let shown = "";
      rt.effect(scope, () => { shown = st.get(); });
      await macrotask();
      st.set("working");
      busy(5);
      st.set("done");
      expect(shown).toBe("done");
      expect(logged).toEqual([]);
    });
  });

  test("MED-1 (ii): every effect the stall skipped runs again once the page yields — the display catches up with the cell", async () => {
    await withStall(0, async (scope, logged) => {
      // a FINITE chain of 8 settles, each writing what a display reads, without a yield: past the
      // bound, the display's 4th re-run is skipped; after the yield it runs and shows the last value
      const x = rt.cell(0);
      let shown = -1;
      let runs = 0;
      rt.effect(scope, () => { runs++; shown = x.get(); });
      await macrotask();
      runs = 0;
      for (let i = 1; i <= 8; i++) { await Promise.resolve(); x.set(i); }
      expect(runs).toBe(4);                          // its first run in the watch + 3 re-runs
      expect(shown).toBe(4);
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain("the skipped renders run again once the page yields");
      await macrotask(5);
      expect(shown).toBe(8);
      expect(runs).toBe(5);                          // once, not once per skipped write
      expect(logged.length).toBe(1);
    });
  });

  test("MED-1 (ii): a disposed effect the stall skipped is not run on the yield", async () => {
    await withStall(0, async (scope, logged) => {
      const x = rt.cell(0);
      const inner = scope.child();
      let runs = 0;
      rt.effect(inner, () => { runs++; x.get(); });
      await macrotask();
      for (let i = 1; i <= 5; i++) x.set(i);         // first run in the watch + 3 re-runs, then skipped
      expect(runs).toBe(5);
      inner.dispose();
      await macrotask(5);
      expect(runs).toBe(5);
      expect(logged.length).toBe(1);
    });
  });

  test("MED-1 (ii): a LOOP the re-run on the yield restarts is not given another second — stopped at its first re-run, not logged again; (r4) it laps once per bound after, never once per task", async () => {
    await withStall(50, async (scope, logged) => {
      const n = rt.cell(0);
      const r = rt.cell(0);
      let runs = 0;
      let armed = false;
      rt.requestOn(scope, r, [n], () => ({ on: n.peek() + 1, then: (v) => { r.set(v); } }));
      rt.effect(scope, () => { runs++; r.get(); if (armed) n.set(n.peek() + 1); });
      await macrotask();
      armed = true;
      const t0 = performance.now();
      n.set(n.peek() + 1);
      await macrotask(20);                           // the stall, the yield, the re-run on the yield
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(2000);                 // not a second stall of 50 ms per yield, forever
      expect(logged.length).toBe(1);
      // s483 r4 (#2123 r3 review MED-1): the skipped retry runs once more about one bound (50 ms) later, so
      // the loop laps about once per bound — each lap one run, then stopped again — not once per task
      // (r3: stopped for good, which also lost a later write from a task; protoA: once per task, 100% CPU)
      const settled = runs;
      await macrotask(260);
      const laps = runs - settled;
      expect(laps).toBeGreaterThanOrEqual(1);
      expect(laps).toBeLessThanOrEqual(8);           // ~5 at one per 50 ms; a loop let go would be thousands
      expect(logged.length).toBe(1);                 // not logged again
      armed = false;
      n.set(n.peek() + 1);                           // a later write: runs as usual, in a new watch
      await macrotask(5);
      expect(runs).toBeGreaterThan(settled);
    });
  });

  test("MED-2: a fake clock (performance.now + setTimeout) installed BEFORE the runtime loads, advanced synchronously by the test, does not trip it", async () => {
    const realST = globalThis.setTimeout;
    const realNow = performance.now;
    let fakeNow = 0;
    const fq = [];
    const advance = (ms) => {
      fakeNow += ms;
      for (;;) {
        fq.sort((p, q) => p.at - q.at);
        if (fq.length === 0 || fq[0].at > fakeNow) break;
        fq.shift().f();
      }
    };
    await freshRuntime("fakeclock", () => {
      performance.now = () => fakeNow;
      globalThis.setTimeout = (f, ms = 0) => { fq.push({ at: fakeNow + ms, f }); return fq.length; };
    }, () => {
      performance.now = realNow;
      globalThis.setTimeout = realST;
    }, async (fresh, scope, logged) => {
      // jest `advanceTimersByTime(3000)`: the click writes "saving" and arms a 3 s timer writing "saved"
      const status = fresh.cell("idle");
      let shown = "";
      fresh.effect(scope, () => { shown = status.get(); });
      for (let i = 0; i < 3; i++) await new Promise((r) => realST(r, 0));
      status.set("saving");
      globalThis.setTimeout(() => status.set("saved"), 3000);
      advance(3000);
      expect(shown).toBe("saved");                   // r2: "saving", with a false "infinite loop" log
      expect(logged).toEqual([]);
    });
  });

  test("MED-3: the clock is read at the start of each update — a loop whose every lap is slow stops about the bound in, not up to 64 laps later", async () => {
    await withStall(100, async (scope, logged) => {
      const n = rt.cell(0);
      const r = rt.cell(0);
      let runs = 0;
      let armed = false;
      rt.requestOn(scope, r, [n], () => ({ on: n.peek() + 1, then: (v) => { r.set(v); } }));
      rt.effect(scope, () => { runs++; r.get(); if (armed) { busy(30); n.set(n.peek() + 1); } });
      await macrotask();
      armed = true;
      runs = 0;
      const t0 = performance.now();
      n.set(n.peek() + 1);
      await new Promise((x) => setTimeout(x, 0));
      const ms = performance.now() - t0;
      armed = false;
      // r2 sampled the clock on the first re-run and every 64th: 64 laps of 30 ms, about 2 s
      expect(runs).toBeLessThan(12);
      expect(ms).toBeLessThan(600);
      expect(logged.length).toBe(1);
    });
  }, 30000);

  test("LOW-2: a MessageChannel that never delivers (replaced before load) — the load-time setTimeout ends the watch; later writes re-render", async () => {
    const RealMC = globalThis.MessageChannel;
    const realST = globalThis.setTimeout;
    await freshRuntime("deadmc", () => {
      globalThis.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage() {} }; } };
    }, () => {
      globalThis.MessageChannel = RealMC;
    }, async (fresh, scope, logged) => {
      globalThis.__scrml_render_stall_ms = 50;
      const a = fresh.cell(0);
      let shown = -1;
      fresh.effect(scope, () => { shown = a.get(); });
      a.set(1);
      await new Promise((r) => realST(r, 120));     // real yields, past the bound
      const seen = [];
      for (let i = 2; i <= 8; i++) {
        a.set(i);
        seen.push(shown);
        await new Promise((r) => realST(r, 0));
      }
      expect(seen).toEqual([2, 3, 4, 5, 6, 7, 8]);   // r2: the watch never ended — [1, 1, 1, …] from the 2nd
      expect(logged).toEqual([]);
    });
  });
});

describe("s483 fix r4 — a frame is a yield, a skipped retry runs again later, slow laps stop about twice the bound in", () => {
  const STALL_LOG = "[scrml] render effects stopped: the page has gone ";
  const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* spin */ } };

  // a FRESH runtime module loaded after `setup()` replaced host globals; `teardown()` puts them back
  async function freshRuntime(tag, setup, teardown, fn) {
    const d = mkdtempSync(join(tmpdir(), "s483-r4-" + tag + "-"));
    copyFileSync(RUNTIME, join(d, "scrml-runtime.js"));
    setup();
    let fresh;
    try {
      fresh = await import(join(d, "scrml-runtime.js"));
    } catch (err) {
      teardown();
      throw err;
    }
    const scope = fresh.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    try {
      await fn(fresh, scope, logged);
    } finally {
      console.error = savedErr;
      teardown();
      scope.dispose();
      delete globalThis.__scrml_render_stall_ms;
      rmSync(d, { recursive: true, force: true });
    }
  }
  // a MessageChannel that never delivers, and a `requestAnimationFrame` whose frames the test fires
  const deadMC = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage() {} }; } };

  test("HIGH-1 (#2123 r3 review, probe stream): a rendering opportunity ends the watch — writes from tasks the runtime's own tick is queued behind are not taken for a stall", async () => {
    // The tick is a message queued behind every waiting task; a page with a backlog of tasks yields
    // between each but its tick arrives late. Modelled: a MessageChannel that never delivers, and
    // frames the test fires between the busy writes (each its own task in the browser). r3: the 5th
    // write was skipped as a stall, with a false "possible infinite loop" log.
    const RealMC = globalThis.MessageChannel;
    const realRaf = globalThis.requestAnimationFrame;
    const frames = [];
    await freshRuntime("frame", () => {
      globalThis.MessageChannel = deadMC;
      globalThis.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
    }, () => {
      globalThis.MessageChannel = RealMC;
      globalThis.requestAnimationFrame = realRaf;
    }, async (fresh, scope, logged) => {
      globalThis.__scrml_render_stall_ms = 50;
      const x = fresh.cell(0);
      const seen = [];
      fresh.effect(scope, () => { seen.push(x.get()); });
      const frame = () => { const fs = frames.splice(0); for (const f of fs) f(performance.now()); };
      frame();
      for (let i = 1; i <= 8; i++) { busy(20); x.set(i); frame(); }
      expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(logged).toEqual([]);
      expect(frames.length).toBeLessThanOrEqual(1);  // one frame callback pending at a time
      // with NO frame (a microtask-only loop never reaches one) the same writes are still bounded
      for (let i = 9; i <= 16; i++) { busy(20); x.set(i); }
      expect(seen.at(-1)).toBe(12);                  // its first run + 3 re-runs, then skipped
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain(STALL_LOG + "50 ms");
      frame();                                       // a frame: the skipped run runs
      expect(seen.at(-1)).toBe(16);
    });
  });

  test("HIGH-1: a frame callback that finds a watch begun after it was asked asks again rather than ending that watch", async () => {
    const RealMC = globalThis.MessageChannel;
    const realRaf = globalThis.requestAnimationFrame;
    const frames = [];
    let port = null;
    await freshRuntime("frame2", () => {
      // a MessageChannel the test delivers by hand
      globalThis.MessageChannel = class { constructor() { const p1 = { onmessage: null }; this.port1 = p1; this.port2 = { postMessage() { port = p1; } }; } };
      globalThis.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
    }, () => {
      globalThis.MessageChannel = RealMC;
      globalThis.requestAnimationFrame = realRaf;
    }, async (fresh, scope, logged) => {
      globalThis.__scrml_render_stall_ms = 50;
      const x = fresh.cell(0);
      const seen = [];
      fresh.effect(scope, () => { seen.push(x.get()); });
      x.set(1);                                      // watch W1 begins; a frame is asked for W1
      expect(frames.length).toBe(1);
      port.onmessage();                              // W1's tick: W1 ends
      x.set(2);                                      // W2 begins (no second frame asked while one is pending)
      expect(frames.length).toBe(1);
      frames.shift()(0);                             // the frame asked for W1 finds W2: it asks again
      expect(frames.length).toBe(1);
      for (let i = 3; i <= 7; i++) { busy(20); x.set(i); }   // still W2: bounded
      expect(logged.length).toBe(1);
      frames.shift()(0);                             // W2's frame: W2 ends, the skipped run runs
      expect(seen.at(-1)).toBe(7);
    });
  });

  test("MED-1 (#2123 r3 review, probes taskwrite / taskreq): a write arriving in the retry's watch is not lost — the skipped retry runs once more about the bound later", async () => {
    // r3: the effect re-queued on the yield ran once; a write in the same watch re-ran it, the re-run
    // was skipped as the retry's, and nothing ever ran it again — the display stayed stale for good.
    const realRaf = globalThis.requestAnimationFrame;
    await freshRuntime("retry", () => {
      globalThis.requestAnimationFrame = undefined;   // no frames (a hidden tab): the tick alone
    }, () => {
      globalThis.requestAnimationFrame = realRaf;
    }, async (fresh, scope, logged) => {
      globalThis.__scrml_render_stall_ms = 50;
      const x = fresh.cell(0);
      let shown = -1;
      let runs = 0;
      let late = false;
      fresh.effect(scope, () => {
        runs++;
        shown = x.get();
        // the late write: it lands in the retry's own watch, after the retry run
        if (late) { late = false; queueMicrotask(() => x.set(100)); }
      });
      await macrotask();
      for (let i = 1; i <= 8; i++) { await Promise.resolve(); busy(20); x.set(i); }
      expect(shown).toBe(4);                         // tripped (a finite slow chain: the ruled cost)
      expect(logged.length).toBe(1);
      late = true;
      await macrotask(5);                            // the yield: the retry run shows 8; the late write's
      expect(x.peek()).toBe(100);                    // re-run in that watch is skipped as the retry's
      expect(shown).toBe(8);
      await macrotask(150);                          // about the bound later: run once more
      expect(shown).toBe(100);                       // r3: 8 for good
      expect(logged.length).toBe(1);                 // not logged again
      const settled = runs;
      await macrotask(150);
      expect(runs).toBe(settled);                    // nothing more to show: no further runs
    });
  });

  test("LOW-1 (#2123 r3 review, probe slow_rerun): a loop whose every lap is slow stops about twice the bound in — the re-run count no longer applies there", async () => {
    globalThis.__scrml_render_stall_ms = 50;
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    let runs = 0;
    let runsAtLog = -1;
    console.error = (...a) => { if (runsAtLog < 0) runsAtLog = runs; logged.push(a.join(" ")); };
    try {
      const n = rt.cell(0);
      const r = rt.cell(0);
      let armed = false;
      rt.requestOn(scope, r, [n], () => ({ on: n.peek() + 1, then: (v) => { r.set(v); } }));
      rt.effect(scope, () => { runs++; r.get(); if (armed) { busy(60); n.set(n.peek() + 1); } });
      await macrotask();
      armed = true;
      runs = 0;
      n.set(n.peek() + 1);
      await macrotask();
      armed = false;
      // laps of 60 ms against a 50 ms bound: the first re-run (at ~60 ms) runs, the second (at ~120 ms,
      // past twice the bound) is skipped. r3 ran the count out first: four re-runs, ~240 ms frozen —
      // with 1 s laps at the default bound, five seconds.
      expect(runsAtLog).toBeLessThanOrEqual(3);
      expect(logged.length).toBe(1);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  });

  test("LOW-1: a first re-run past twice the bound still runs — one slow update is not a loop", async () => {
    globalThis.__scrml_render_stall_ms = 20;
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    try {
      const status = rt.cell("idle");
      let shown = "";
      rt.effect(scope, () => { shown = status.get(); });
      await macrotask();
      await Promise.resolve();
      status.set("saving");
      busy(60);                                      // three bounds without a yield
      await Promise.resolve();
      status.set("saved");
      expect(shown).toBe("saved");
      expect(logged).toEqual([]);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  });
});

describe("s483 fix r5 — a stopped loop stays stopped across its drivers; the delayed retry runs only what is left to show", () => {
  async function withStall(stallMs, fn) {
    const scope = rt.root.child();
    const logged = [];
    const savedErr = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    globalThis.__scrml_render_stall_ms = stallMs;
    try {
      await fn(scope, logged);
    } finally {
      delete globalThis.__scrml_render_stall_ms;
      console.error = savedErr;
      scope.dispose();
    }
  }
  const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* spin */ } };

  test("HIGH-1 (#2123 r4 review, probe chain_retry K=2): a loop with two drivers is stopped once — one freeze, one log; after it the page answers and the loop laps about once per bound", async () => {
    // Each effect reads its own cell; its run's microtask writes its own cell (a self-loop) and the
    // other's. r4: each delayed retry's lap re-ran the OTHER effect outside its retry, with a fresh bound —
    // a stall of the bound, then another, back to back without end, logged every time (killed at 40 s
    // at the default bound; no timer task got through).
    await withStall(50, async (scope, logged) => {
      const K = 2;
      const c = Array.from({ length: K }, () => rt.cell(0));
      const runs = new Array(K).fill(0);
      let armed = false;
      for (let i = 0; i < K; i++) {
        rt.effect(scope, () => {
          runs[i]++;
          c[i].get();
          if (armed) Promise.resolve().then(() => { c[i].set(c[i].peek() + 1); const j = (i + 1) % K; c[j].set(c[j].peek() + 1); });
        });
      }
      await macrotask();
      armed = true;
      c[0].set(1);
      await macrotask(20);                           // the stall (about the bound), the yield
      expect(logged.length).toBe(1);
      // the page answers: a 5 ms heartbeat over 12 bounds — r4 froze the bound, back to back
      const settled = runs[0] + runs[1];
      let last = performance.now();
      let maxGap = 0;
      await new Promise((done) => {
        const t0 = last;
        const beat = () => {
          const t = performance.now();
          maxGap = Math.max(maxGap, t - last);
          last = t;
          if (t - t0 < 600) setTimeout(beat, 5); else done(null);
        };
        setTimeout(beat, 5);
      });
      armed = false;
      expect(maxGap).toBeLessThan(45);               // no further stall of the bound (50 ms)
      expect(logged.length).toBe(1);                 // reported once
      const laps = runs[0] + runs[1] - settled;
      expect(laps).toBeGreaterThanOrEqual(2);        // still lapping, about once per bound each
      expect(laps).toBeLessThanOrEqual(60);          // a loop let go would be thousands
    });
  }, 20000);

  test("HIGH-1: a stopped loop's mark clears after one watch it runs in without a skip — a later two-run update shows its last value at once", async () => {
    await withStall(50, async (scope, logged) => {
      const x = rt.cell(0);
      let shown = -1;
      rt.effect(scope, () => { shown = x.get(); });
      await macrotask();
      for (let i = 1; i <= 8; i++) { await Promise.resolve(); busy(20); x.set(i); }   // a finite slow chain trips
      expect(logged.length).toBe(1);
      await macrotask(5);                            // the yield: the skipped display runs again
      expect(shown).toBe(8);
      await macrotask(120);                          // a watch it ran in without a skip
      x.set(20);
      await Promise.resolve();
      x.set(21);                                     // re-run in the same watch: not deferred
      expect(shown).toBe(21);
      expect(logged.length).toBe(1);
    });
  });

  test("LOW-1 (#2123 r4 review, probe spurious3): the delayed retry does not run an effect again that has run since it was skipped", async () => {
    await withStall(50, async (scope, logged) => {
      const x = rt.cell(0);
      let shown = -1;
      let runs = 0;
      let late = false;
      rt.effect(scope, () => {
        runs++;
        shown = x.get();
        if (late) { late = false; queueMicrotask(() => x.set(x.peek() + 1000)); }   // lands in the retry's watch
      });
      await macrotask();
      for (let i = 1; i <= 8; i++) { await Promise.resolve(); busy(20); x.set(i); }   // a finite slow chain trips
      expect(logged.length).toBe(1);
      late = true;
      await macrotask(5);                            // the yield: the retry runs (8); its re-run (1008) is
      expect(shown).toBe(8);                         // skipped, and a delayed retry is armed
      x.set(5000);                                   // a later write runs it as usual
      expect(shown).toBe(5000);
      const runsAfterWrite = runs;
      await macrotask(150);                          // past the delayed retry
      expect(runs).toBe(runsAfterWrite);             // r4: one more run, nothing changed
      expect(shown).toBe(5000);
      expect(logged.length).toBe(1);
    });
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
// probe X2's glue (p-X2_glue_microtask): the click comes from the glue's OWN microtask
const GLUE_X2 = "export function clickB() { queueMicrotask(() => { const b = document.getElementById('b'); if (b) b.click(); }); return 0; }\n";
// probes P5 / P6 (review r1): an `if=` / `else` pair whose arms each hold a mount request advancing the other
// arm's condition — no host code; P5 stops at 150, P6 never stops (a request ring through arm mounts)
const IF_STEPS = (adv, test) => `<program>\nfunction adv(s: int) -> int { return ${adv}; }\nlet <sa:int=0/>\nlet <sb:int=0/>\n` +
  `<div if=\${${test}}><request id="ea" deps=[]>\${ @sa = adv(@sb); }</>even</div>\n` +
  `<div else>odd<request id="eb" deps=[]>\${ @sb = adv(@sa); }</></div>\n` +
  `<p id="o">\${@sa + @sb}</p>\n<p id="c">\${@sb}</p>\n<button id="b" onclick=\${() => { @sa = 0; @sb = 0; }}>b</button>\n</program>\n`;
const META_RING = (display) => `<program>\nlet <n:int=0/>\nlet <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = @n + 1; }</>\n` +
  `<div>^{ meta.set("n", meta.get("r")); }</div>\n` + (display ? `<p id="o">\${@r}</p>\n` : "") +
  `<p id="c">\${@n}</p>\n<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>\n</program>\n`;
const LOADING = `<program>\nfunction spin(k: int) -> int {\n  let s: int = 0;\n  for (let i: int = 0; i < k; i = i + 1) { s = s + (i % 7); }\n  return s;\n}\n` +
  `let <k:int=0/>\nlet <big:int=0/>\nlet <done:int=0/>\n` +
  `<request id="rq" deps=[@k]>\${ @big = @k; }</>\n<request id="rq2" deps=[@big]>\${ @done = @big; }</>\n` +
  `<p id="o">\${@done == @k ? "Done" : "Loading"}</p>\n<p id="c">\${@big > 0 ? spin(@big) : 0}</p>\n` +
  `<button id="b" onclick=\${() => { @k = @k + 1500000000; }}>b</button>\n</program>\n`;
const PROBES = {
  // probe F9 (p-R1_interp): an interpolation whose glue clicks a button whose handler writes the cell it reads
  f9: { src: P(`<p id="o">\${ck() + @n}</p>`), glue: GLUE },
  // probe R10 (p-R10_req_settle): the same loop through a `<request>`'s settle — a new flush each lap
  r10: { src: P(`let <r:int=0/>\n<request id="rq" deps=[@n]>\${ @r = @n + 1; }</>\n<p id="o">\${ck() + @r}</p>`), glue: GLUE },
  // probe X2 (p-X2_glue_microtask): the loop's writes come from the glue's own microtask
  x2: { src: P(`<p id="o">\${ck() + @n}</p>`), glue: GLUE_X2 },
  p5: { src: IF_STEPS("s < 150 ? s + 1 : s", "@sa <= @sb && @sb < 150"), glue: null },
  p6: { src: IF_STEPS("s + 1", "@sa <= @sb"), glue: null },
  // s483 r3 — review r2 HIGH-1, probes M1 / M1c: a runtime `^{}` block and a `<request>` in a ring
  // through `meta.set` — no host code, 0 diagnostics; on base and r2 the page never finished loading
  m1: { src: META_RING(true), glue: null },
  m1c: { src: META_RING(false), glue: null },
  // s483 r3 — review r2 MED-1, probe M2b: one slow update (a ~1.5 s render between two settles) that
  // re-runs the "Done" / "Loading" display once — r2 skipped that re-run and showed "Loading" for good
  m2b: { src: LOADING, glue: null },
};
const STALL = "[scrml] render effects stopped: the page has gone 1000 ms without yielding to the browser";
// s483 r4 — runtime-level Chromium pages (#2123 r3 review probes stream / taskwrite): the page imports the
// bootstrap runtime and leaves its result in `window.__res`
const RT_SCEN = (body) => `import * as rt from "./rt.js";\nconst logged = [];\n` +
  `console.error = (...a) => { logged.push(a.join(" ")); };\n` +
  `const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} };\n` +
  `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\nconst scope = rt.root.child();\n` +
  `const res = await (async () => {\n${body}\n})();\nwindow.__res = { ...res, logs: logged.length };\n`;
const RT_PAGES = {
  // a worker streams 2000 messages faster than the page handles them (3 ms each): the page yields
  // between every message but falls behind by more than a second — r3 took that for a stall
  "stream.html": `<script type="module" src="./stream.js"></script>`,
  "stream.js": RT_SCEN(`const x = rt.cell(0); let shown = -1;
  rt.effect(scope, () => { shown = x.get(); });
  await sleep(20);
  const w = new Worker("./stream-worker.js");
  await new Promise((done) => { w.onmessage = (e) => { busy(3); x.set(e.data); if (e.data === 2000) done(null); }; w.postMessage(2000); });
  const atEnd = shown; await sleep(300);
  return { cell: x.peek(), atEnd, after: shown };`),
  "stream-worker.js": `onmessage = (e) => { const n = e.data; let i = 0; const go = () => { for (let k = 0; k < 2 && i < n; k++) postMessage(++i); if (i < n) setTimeout(go, 1); }; go(); };\n`,
  // a finite slow chain (8 × 200 ms, the ruled cost: it trips), and a write from a timer queued during it
  // — r3 dropped that write for good (the display stayed 8)
  "taskwrite.html": `<script type="module" src="./taskwrite.js"></script>`,
  "taskwrite.js": RT_SCEN(`const x = rt.cell(0); let shown = -1;
  rt.effect(scope, () => { shown = x.get(); });
  await sleep(20);
  for (let i = 1; i <= 8; i++) { await Promise.resolve(); busy(200); x.set(i); if (i === 1) setTimeout(() => x.set(100), 0); }
  await sleep(1600);
  return { cell: x.peek(), after: shown };`),
};
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
    if (p.startsWith("/rt/")) {
      // s483 r4 — runtime-level pages: the runtime module, a scenario page, a worker
      const f = p.slice(4);
      if (f === "rt.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(readFileSync(RUNTIME)); return; }
      if (f in RT_PAGES) { res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(RT_PAGES[f]); return; }
      res.writeHead(404); res.end(); return;
    }
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

  test("probe M1 (review r2 HIGH-1, compiled, no host code — a `^{}` block and a `<request>` in a ring through `meta.set`): the page loads and stays responsive, one log per stall", async () => {
    // on base and r2 the page never finished loading: the block was outside the stall bound
    // (pa-ruled:S483-render-bound-covers-markup-meta — a runtime `^{}` block in markup is rendering work)
    const { before, atLoad, clicks, errors } = await clickProbe("m1", { loadLog: true });
    expect(before).toBeGreaterThan(100);
    expect(atLoad.length).toBe(1);
    expect(atLoad[0]).toContain(STALL);
    expect(typeof clicks).toBe("number");
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain(STALL);
  }, 60000);

  test("probe M1c (the same ring, no render effect reading `@r`): the page loads and stays responsive, one log per stall", async () => {
    const { before, atLoad, clicks, errors } = await clickProbe("m1c", { loadLog: true });
    expect(before).toBeGreaterThan(100);
    expect(atLoad.length).toBe(1);
    expect(atLoad[0]).toContain(STALL);
    expect(typeof clicks).toBe("number");
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain(STALL);
  }, 60000);

  test("probe M2b (review r2 MED-1, compiled — one slow update re-runs the display once): it shows \"Done\", as on base, no log", async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push("pageerror " + e.message));
    try {
      await page.goto(`http://127.0.0.1:${port}/m2b/`);
      await page.waitForSelector("#o", { timeout: 10000 });
      expect(await page.evaluate(() => document.querySelector("#o").textContent)).toBe("Done");
      await page.click("#b");
      // the ~1.5 s render runs between the two settles; r2 left "Loading" for good
      await page.waitForFunction(() => document.querySelector("#o").textContent === "Done" && document.querySelector("#c").textContent !== "0", { timeout: 15000, polling: 100 });
      await new Promise((r) => setTimeout(r, 300));
      expect(await page.evaluate(() => document.querySelector("#o").textContent)).toBe("Done");
      expect(errors).toEqual([]);
    } finally {
      page.close().catch(() => {});
    }
  }, 60000);

  // s483 r4 — runtime-level pages
  async function rtPage(name) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror " + e.message));
    try {
      await page.goto(`http://127.0.0.1:${port}/rt/${name}.html`);
      await page.waitForFunction(() => window.__res !== undefined, { timeout: 40000, polling: 200 });
      return { ...(await page.evaluate(() => window.__res)), errors };
    } finally {
      page.close().catch(() => {});
    }
  }

  test("r4 HIGH-1 (#2123 r3 review, probe stream): a message stream the page falls behind on — yielding between every message — is not a stall: every value shown, no log", async () => {
    const r = await rtPage("stream");
    expect(r.errors).toEqual([]);
    expect(r.cell).toBe(2000);
    expect(r.atEnd).toBe(2000);                      // r3: 1438–1915, with a false log
    expect(r.after).toBe(2000);
    expect(r.logs).toBe(0);
  }, 60000);

  test("r4 MED-1 (#2123 r3 review, probe taskwrite): a write from a timer queued during a stall is shown — not lost", async () => {
    const r = await rtPage("taskwrite");
    expect(r.errors).toEqual([]);
    expect(r.cell).toBe(100);
    expect(r.after).toBe(100);                       // r3: 8 for good
    expect(r.logs).toBe(1);                          // the finite slow chain trips: the ruled cost
  }, 60000);
});
