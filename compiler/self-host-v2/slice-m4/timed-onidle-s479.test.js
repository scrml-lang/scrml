// timed-onidle-s479.test.js — s479-timed-onidle: a `debounced=` / `throttled=` ENGINE cell with an
// `<onIdle>` watchdog (ruling: user-voice-scrml.md S479 "⭐ RULED — three open S479 questions, PA
// recs adopted", item 2): "The watchdog firing applies immediately. It's already a timed
// transition, and delaying it again would stack the window on top of `after=`. It cancels any write
// still waiting, since that write was requested against a state that just changed. The watchdog's
// "re-arm on every committed transition" rule stays as is."
//
// SPEC §51.0.R ("Composition with `debounced=` / `throttled=`") and §6.13.5 carry the sentence.
// The runtime half runs under the conformance harness's virtual clock (FakeClock) — no real waits.
// Red on base (origin/main e415f40b0): every program here was E-BOOTSTRAP-UNSUPPORTED ("an engine
// with an `<onIdle>` watchdog: … not built").

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { FakeClock } from "../../../conformance/fake-clock.ts";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);

// Active ⇄ Busy, either → Idle, Idle → Active. The watchdog moves the engine to .Idle after 5 s
// without a committed transition. `busyRule` lets a test make the watchdog's own edge illegal.
const ENGINE = (timing, busyRule = "(.Active | .Idle)") => `<program>
type Phase:enum = { Active, Busy, Idle }
<phase:Phase=.Active single ${timing}>
    <Active rule=(.Busy | .Idle)></>
    <Busy rule=${busyRule}></>
    <Idle rule=.Active></>
    <onIdle after=5s to=.Idle/>
</>
function busy() { @phase = .Busy; }
function active() { @phase = .Active; }
<main><p id="s">\${@phase}</p><button id="busy" onclick=busy()>b</button><button id="active" onclick=active()>a</button></main>
</program>
`;

const state = () => document.querySelector("#s").textContent;
const press = (id) => click(document.querySelector("#" + id));
let reported = [];
const isInvalid = (e) => String(e && e.message ? e.message : e).includes("E-ENGINE-INVALID-TRANSITION");
const invalidTransitions = () => takePageErrors().concat(reported.splice(0, reported.length)).filter(isInvalid);

async function withClock(src, name, body) {
  const clock = new FakeClock();
  clock.install();
  const hadReport = Object.prototype.hasOwnProperty.call(globalThis, "reportError");
  const prevReport = globalThis.reportError;
  globalThis.reportError = (e) => { reported.push(e); };
  reported = [];
  try {
    const r = run(src);
    expect(r.diags).toEqual([]);
    const loaded = await loadProgram(r.core, name, []);
    await body(clock, loaded);
  } finally {
    clock.restore();
    if (hadReport) globalThis.reportError = prevReport;
    else delete globalThis.reportError;
    expect(reported).toEqual([]);                   // every report was asserted by the test
  }
}

describe("compile: a timed engine with an <onIdle> watchdog is accepted (ruling S479 item 2)", () => {
  for (const timing of ["debounced=1s", "throttled=1s"]) {
    test(`${timing} + <onIdle> compiles clean; the field carries its timing and its watchdog`, () => {
      const r = run(ENGINE(timing));
      expect(r.diags).toEqual([]);
      const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
      const f = prog.fields.find((x) => x.sym.hint === "phase");
      expect(f.timing).toEqual({ throttle: timing.startsWith("throttled"), ms: 1000 });
      expect(f.graph.idle).toEqual({ ms: 5000, to: 2 });
    });
  }
});

describe("debounced engine + <onIdle>", () => {
  test("the watchdog fires while a write is held: it commits at once, the held write is dropped, the value is the watchdog's target", async () => {
    await withClock(ENGINE("debounced=1s"), "toi-d1", async (clock) => {
      await clock.advance(4500);
      press("busy");                                // held until 5500
      expect(state()).toBe("Active");
      expect(clock.pendingCount()).toBe(2);         // the watchdog + the held write's timer
      await clock.advance(500);                     // t=5000: the watchdog fires
      expect(state()).toBe("Idle");                 // at once — not held by the 1 s window
      expect(clock.pendingCount()).toBe(1);         // the held write's timer is gone; the watchdog re-armed
      await clock.advance(1000);                    // t=6000: past where the held .Busy would have committed
      expect(state()).toBe("Idle");                 // dropped (Idle → Busy would also be illegal: nothing reported)
      expect(invalidTransitions()).toEqual([]);
    });
  }, { timeout: 60000 });

  test("no double window: the fire lands at exactly `after=` — not `after=` plus the timing window", async () => {
    for (const timing of ["debounced=1s", "throttled=1s"]) {
      await withClock(ENGINE(timing), "toi-nd-" + timing.substring(0, 1), async (clock) => {
        await clock.advance(4999);
        expect(state()).toBe("Active");
        await clock.advance(1);                     // t=5000: the watchdog's own after=
        expect(state()).toBe("Idle");               // committed at once — no 1 s hold stacked on it
        await clock.advance(1000);
        expect(state()).toBe("Idle");
        expect(clock.pendingCount()).toBe(1);       // only the re-armed watchdog: no held timer was made
      });
    }
  }, { timeout: 60000 });

  test("re-arm on every committed transition is unchanged: the fire re-arms, a later commit re-arms again", async () => {
    await withClock(ENGINE("debounced=1s"), "toi-d2", async (clock) => {
      await clock.advance(5000);
      expect(state()).toBe("Idle");                 // fired from .Active at 5 s (no write at all)
      expect(clock.pendingCount()).toBe(1);         // its own committed transition re-armed it
      await clock.advance(500);
      press("active");                              // t=5500: held until 6500
      await clock.advance(1000);
      expect(state()).toBe("Active");               // committed → re-armed: next fire at 11500
      await clock.advance(4999);
      expect(state()).toBe("Active");
      await clock.advance(1);
      expect(state()).toBe("Idle");
    });
  }, { timeout: 60000 });

  test("a write after the fire behaves normally: held for the window, then committed", async () => {
    await withClock(ENGINE("debounced=1s"), "toi-d3", async (clock) => {
      await clock.advance(4500);
      press("busy");
      await clock.advance(500);                     // fire: Idle, .Busy dropped
      press("active");                              // t=5000: held
      expect(state()).toBe("Idle");
      await clock.advance(999);
      expect(state()).toBe("Idle");
      await clock.advance(1);
      expect(state()).toBe("Active");
      expect(invalidTransitions()).toEqual([]);
    });
  }, { timeout: 60000 });

  test("a fire that changes nothing (already at `to=`, a §51.0.F.1 no-op) is no transition: a held write stays and commits", async () => {
    await withClock(ENGINE("debounced=1s"), "toi-d4", async (clock) => {
      await clock.advance(5000);                    // fire: Active → Idle, re-armed for 10000
      expect(state()).toBe("Idle");
      await clock.advance(4500);
      press("active");                              // t=9500: held until 10500
      await clock.advance(500);                     // t=10000: fire Idle → Idle — a no-op
      expect(state()).toBe("Idle");
      expect(clock.pendingCount()).toBe(1);         // the held write's timer is still there
      await clock.advance(500);
      expect(state()).toBe("Active");               // the held write committed
      expect(invalidTransitions()).toEqual([]);
    });
  }, { timeout: 60000 });

  test("the fire keeps its own rule= judgement: a refused fire is reported, changes nothing, and cancels nothing", async () => {
    await withClock(ENGINE("debounced=1s", ".Active"), "toi-d5", async (clock) => {
      press("busy");
      await clock.advance(1000);                    // t=1000: Active → Busy commits, re-arms for 6000
      expect(state()).toBe("Busy");
      await clock.advance(4500);
      press("active");                              // t=5500: held until 6500
      await clock.advance(500);                     // t=6000: fire Busy → Idle — not an edge of .Busy
      expect(state()).toBe("Busy");
      const errs = invalidTransitions();
      expect(errs.length).toBe(1);
      expect(String(errs[0].message)).toContain(".Busy → .Idle");
      await clock.advance(500);
      expect(state()).toBe("Active");               // the held write was not cancelled
    });
  }, { timeout: 60000 });
});

describe("throttled engine + <onIdle>", () => {
  // throttled=10s: one window outlasts the 5 s watchdog.
  test("the watchdog fires while a throttle window is open: it commits at once and drops the held trailing write", async () => {
    await withClock(ENGINE("throttled=10s"), "toi-t1", async (clock) => {
      await clock.advance(1000);
      press("busy");                                // t=1000: leading — Busy at once; window to 11000; watchdog re-armed for 6000
      expect(state()).toBe("Busy");
      await clock.advance(1000);
      press("active");                              // t=2000: held (trailing at 11000)
      expect(state()).toBe("Busy");
      await clock.advance(4000);                    // t=6000: the watchdog fires
      expect(state()).toBe("Idle");                 // at once, inside the open window
      await clock.advance(6000);                    // t=12000: past the trailing emit
      expect(state()).toBe("Idle");                 // the held .Active was dropped
      expect(invalidTransitions()).toEqual([]);
    });
  }, { timeout: 60000 });

  test("a write after the fire behaves normally: the fire is not an emit, so the window still open is the one the leading write opened", async () => {
    await withClock(ENGINE("throttled=10s"), "toi-t2", async (clock) => {
      await clock.advance(1000);
      press("busy");                                // t=1000: leading; window to 11000
      await clock.advance(5000);                    // t=6000: fire → Idle
      expect(state()).toBe("Idle");
      await clock.advance(1000);
      press("active");                              // t=7000: inside the 1000–11000 window → held
      expect(state()).toBe("Idle");
      await clock.advance(3999);
      expect(state()).toBe("Idle");
      await clock.advance(1);                       // t=11000: trailing emit, judged from .Idle
      expect(state()).toBe("Active");
      expect(invalidTransitions()).toEqual([]);
    });
  }, { timeout: 60000 });

  test("after the window the next write is a leading write again", async () => {
    await withClock(ENGINE("throttled=1s"), "toi-t3", async (clock) => {
      await clock.advance(5000);                    // fire: Active → Idle
      expect(state()).toBe("Idle");
      press("active");                              // t=5000: the last emit was never — leading, at once
      expect(state()).toBe("Active");
      expect(invalidTransitions()).toEqual([]);
    });
  }, { timeout: 60000 });
});
