// timed-engine-s479.test.js — s479-engine-timing: a `debounced=` / `throttled=` ENGINE cell
// transitions at commit (ruling: user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off
// §3.B, PA recs adopted", item 8).
//
// SPEC §6.13.5: "A `debounced=` / `throttled=` engine cell **transitions at commit**. A write to it
// is held by the timing rule like any other local write, and the transition happens when the held
// value commits: `rule=` (§51.0.F) is judged at the commit, against the variant the cell holds
// then … A held write that a later write in the same window supersedes never commits, so it is
// never judged. A committed write that violates `rule=` is the runtime
// `E-ENGINE-INVALID-TRANSITION`: the cell keeps its prior value … the violation is a trap (§19.17)
// of the unit the commit runs in — the event handler for a commit that lands at once (a throttle's
// leading write), the timer for a trailing commit, where it is reported to the logging surface."
// "Static check of LITERAL held writes: a write `@var = .Variant` to a timed engine cell, where no
// variant reachable from the cell's initial variant along its `rule=` edges is `.Variant` or has
// `.Variant` in its `rule=`, could never commit and SHALL be `E-ENGINE-INVALID-TRANSITION` (§34) at
// the write site."
//
// The runtime half runs under the conformance harness's virtual clock (FakeClock) — no real waits.
// Red on base (origin/main 8d432fcf3): every program here was E-BOOTSTRAP-UNSUPPORTED ("an engine
// … §6.13 rules no timing wrapper over them").

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { FakeClock } from "../../../conformance/fake-clock.ts";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const diags = (src) => run(src).diags.map((d) => [d.code, d.severity]);

// Idle → Loading → Done → Idle; `Gone` is a variant no state's rule= reaches; `Lost` has an
// incoming edge only from `Gone` (so it is not reachable either).
const ENGINE = (timing, fns, buttons = "", extra = "") => `<program>
type Phase:enum = { Idle, Loading, Done, Gone, Lost }
<phase:Phase=.Idle single ${timing}>
    <Idle rule=.Loading>${extra}</>
    <Loading rule=.Done></>
    <Done rule=.Idle></>
    <Gone rule=.Lost></>
    <Lost rule=.Idle></>
</>
${fns}
<main><p id="s">\${@phase}</p>${buttons}</main>
</program>
`;

describe("compile: a timed engine is accepted (§6.13.5)", () => {
  for (const timing of ["debounced=1s", "throttled=1s"]) {
    test(`${timing} on an engine compiles clean; the field carries its timing and graph`, () => {
      const r = run(ENGINE(timing, "function go() { @phase = .Loading; }", `<button onclick=go()>g</button>`));
      expect(r.diags).toEqual([]);
      const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
      const f = prog.fields.find((x) => x.sym.hint === "phase");
      expect(f.timing).toEqual({ throttle: timing.startsWith("throttled"), ms: 1000 });
      expect(f.graph).not.toBeNull();
    });
  }
});

describe("static check of LITERAL held writes (§6.13.5) — E-ENGINE-INVALID-TRANSITION", () => {
  const fn = (target) => `function go() { @phase = .${target}; }`;
  const B = `<button onclick=go()>g</button>`;
  test("a target no reachable state is or admits (no incoming edge from a reachable state) → error at the write", () => {
    const r = run(ENGINE("debounced=1s", fn("Gone"), B));
    expect(r.diags.map((d) => [d.code, d.severity])).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
    expect(r.diags[0].message).toContain("held write");
    expect(r.diags[0].message).toContain(".Idle, .Loading, .Done");
    expect(r.diags[0].message).toContain("§6.13.5");
  });
  test("a target whose only incoming edge is from an UNREACHABLE state (`.Lost`, from `.Gone`) → error (reachability, not mere incoming edges)", () => {
    expect(diags(ENGINE("throttled=1s", fn("Lost"), B))).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });
  for (const t of ["Idle", "Loading", "Done"]) {
    test(`a reachable target \`.${t}\` is left to the commit-time check (no diagnostic)`, () => {
      expect(diags(ENGINE("debounced=1s", fn(t), B))).toEqual([]);
    });
  }
  test("a non-literal target is left to the commit-time check", () => {
    expect(diags(ENGINE("debounced=1s", "function go(p: Phase) { @phase = p; }", `<button onclick=go(.Gone)>g</button>`))).toEqual([]);
  });
  test("the same `.Lost` write to an UNTIMED engine is not this check (the untimed rule: it has an incoming edge)", () => {
    expect(diags(ENGINE("", fn("Lost"), B))).toEqual([]);
  });
  test("inside a state-child body the from-state check still applies (one report)", () => {
    const src = ENGINE("debounced=1s", "", "", `<button onclick=\${@phase = .Done}>x</>`);
    expect(diags(src)).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });
});

// ---------------------------------------------------------------------------
// The runtime, under the virtual clock.
// ---------------------------------------------------------------------------
const RT = (timing) => ENGINE(timing,
  "function load() { @phase = .Loading; }\nfunction finish() { @phase = .Done; }",
  `<button id="load" onclick=load()>l</button><button id="finish" onclick=finish()>f</button>`);
const state = () => document.querySelector("#s").textContent;
const press = (id) => click(document.querySelector("#" + id));
// A click whose handler may trap: the trap reaches the window `error` event (a browser reports an
// exception thrown in a listener there), drained by takePageErrors below.
const pressTrapping = (id) => document.querySelector("#" + id).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
// A trailing commit runs in a timer and is REPORTED (runtime `reportLater` → the host's
// `reportError`, which a browser turns into the same window `error` event). happy-dom has no
// `reportError`, so the test installs one that records what was reported.
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

describe("debounced engine — write → hold → commit → rule check (§6.13.5)", () => {
  test("a legal write is held, then transitions when it commits", async () => {
    await withClock(RT("debounced=1s"), "te-d1", async (clock) => {
      press("load");
      expect(state()).toBe("Idle");                 // held
      await clock.advance(999);
      expect(state()).toBe("Idle");
      await clock.advance(1);
      expect(state()).toBe("Loading");              // committed: Idle → Loading
      press("finish");
      await clock.advance(1000);
      expect(state()).toBe("Done");                 // Loading → Done, judged against Loading
    });
  }, { timeout: 60000 });

  test("rule= is judged at COMMIT, not at the write: an illegal write superseded in the window is never judged", async () => {
    await withClock(RT("debounced=1s"), "te-d2", async (clock) => {
      press("finish");                              // Idle → Done is illegal — but it is only held
      press("load");                                // supersedes it within the window
      await clock.advance(1000);
      expect(state()).toBe("Loading");
      expect(invalidTransitions()).toEqual([]);     // nothing was rejected
    });
  }, { timeout: 60000 });

  test("a violating commit leaves the cell at its prior value and is reported (E-ENGINE-INVALID-TRANSITION), never thrown into the timer", async () => {
    await withClock(RT("debounced=1s"), "te-d3", async (clock) => {
      press("finish");                              // Idle → Done: held
      await clock.advance(1000);                    // commits → refused
      expect(state()).toBe("Idle");
      const errs = invalidTransitions();
      expect(errs.length).toBe(1);
      expect(String(errs[0].message)).toContain(".Idle → .Done");
      press("load");                                // the cell still works: Idle → Loading
      await clock.advance(1000);
      expect(state()).toBe("Loading");
    });
  }, { timeout: 60000 });

  test("the from-state is the one held at commit: Idle→Loading commits, then a held .Done commits from Loading", async () => {
    await withClock(RT("debounced=1s"), "te-d4", async (clock) => {
      press("load");
      await clock.advance(1000);
      press("finish");
      press("finish");                              // coalesced
      await clock.advance(1000);
      expect(state()).toBe("Done");
    });
  }, { timeout: 60000 });
});

describe("throttled engine — leading commit in the handler, trailing commit in the timer (§6.13.5)", () => {
  test("leading write commits at once (judged then); held writes commit at window end, judged against the variant then", async () => {
    await withClock(RT("throttled=1s"), "te-t1", async (clock) => {
      press("load");
      expect(state()).toBe("Loading");              // leading emit: Idle → Loading, at once
      press("finish");                              // held (inside the window)
      expect(state()).toBe("Loading");
      await clock.advance(1000);
      expect(state()).toBe("Done");                 // trailing commit judged from Loading
    });
  }, { timeout: 60000 });

  test("a violating LEADING commit is a trap of the event handler; the cell keeps its value and no window opens", async () => {
    await withClock(RT("throttled=1s"), "te-t2", async (clock) => {
      pressTrapping("finish");                      // leading: Idle → Done — refused in the handler
      expect(state()).toBe("Idle");
      expect(invalidTransitions().length).toBe(1);
      press("load");                                // no window was opened: leading again, at once
      expect(state()).toBe("Loading");
    });
  }, { timeout: 60000 });

  test("a violating TRAILING commit is reported from the timer; the cell keeps its value", async () => {
    await withClock(RT("throttled=1s"), "te-t3", async (clock) => {
      press("load");                                // leading: Loading
      press("load");                                // held: Loading → Loading (a self-write)
      press("load");
      await clock.advance(1000);
      expect(state()).toBe("Loading");              // self-write at commit: a no-op (§51.0.F.1)
      expect(invalidTransitions()).toEqual([]);
      await clock.advance(5000);
      press("finish");                              // leading: Loading → Done
      expect(state()).toBe("Done");
      press("load");                                // held: Done → Loading is illegal
      await clock.advance(1000);
      expect(state()).toBe("Done");
      expect(invalidTransitions().length).toBe(1);
    });
  }, { timeout: 60000 });
});

// r1 (F1, PR #1972 review): a commit whose downstream EFFECT throws still committed — the value
// landed, so it is an emit and (on a throttle) opens the window. §6.13.3: "a `throttled=` cell
// emits at most once per window"; the window is opened by the emit, not undone by an effect that
// throws during it. Only a REFUSED edge (an engine's commit-time `rule=` check) opens no window.
// The effect error itself surfaces as on base: thrown into the handler for a leading commit, out
// of the timer for a trailing one — never swallowed into the commit gate's refusal report.
// Red on c773540cb (head before r1): the throttle cases commit every write.
describe("a throwing effect does not disable timing (r1 F1) — engine and non-engine cells", () => {
  const TABLE = { Idle: ["Loading"], Loading: ["Done"], Done: ["Idle"] };
  let rtmod;
  beforeAll(async () => { rtmod = await import("../slice-m1/runtime/runtime.js"); });

  async function withRt(kind, engine, body) {
    const clock = new FakeClock();
    clock.install();
    const hadReport = Object.prototype.hasOwnProperty.call(globalThis, "reportError");
    const prevReport = globalThis.reportError;
    const rep = [];
    globalThis.reportError = (e) => { rep.push(e); };
    const s = new rtmod.Scope(null);
    try {
      const c = rtmod.timed(s, rtmod.cell(engine ? "Idle" : 0), kind, 1000, engine ? TABLE : null);
      rtmod.effect(s, () => { const v = c.get(); if (v !== 0 && v !== "Idle") throw new Error("effect boom " + v); });
      const write = (v) => (engine ? rtmod.transition(c, TABLE, v) : c.set(v));
      await body({ clock, c, write });
      expect(rep).toEqual([]);                      // an effect error is never re-routed to the refusal report
    } finally {
      s.dispose?.();
      clock.restore();
      if (hadReport) globalThis.reportError = prevReport;
      else delete globalThis.reportError;
    }
  }

  for (const engine of [false, true]) {
    const label = engine ? "engine" : "non-engine";
    // engine: Idle → Loading (leading) → Done (trailing) → Idle (held, its effect does not throw)
    const [a, b, c3, d] = engine ? ["Loading", "Done", "Done", "Idle"] : [1, 2, 3, 4];
    test(`throttle (${label}): the leading commit's effect throws — the value landed and the window is open`, async () => {
      await withRt("throttle", engine, async ({ clock, c, write }) => {
        expect(() => write(a)).toThrow("effect boom"); // leading: committed; the effect trap reaches the handler
        expect(c.peek()).toBe(a);
        write(b);                                      // inside the window: HELD, not committed
        write(c3);
        expect(c.peek()).toBe(a);
        await expect(clock.advance(1000)).rejects.toThrow("effect boom"); // trailing commit; its effect throws out of the timer
        expect(c.peek()).toBe(c3);
        write(d);                                      // the trailing commit opened the next window: held
        expect(c.peek()).toBe(c3);
        if (engine) await clock.advance(1000);
        else await expect(clock.advance(1000)).rejects.toThrow("effect boom");
        expect(c.peek()).toBe(d);
      });
    }, { timeout: 60000 });

    test(`debounce (${label}): the commit's effect throws out of the timer; the cell keeps debouncing`, async () => {
      await withRt("debounce", engine, async ({ clock, c, write }) => {
        write(a);
        expect(c.peek()).toBe(engine ? "Idle" : 0);   // held
        await expect(clock.advance(1000)).rejects.toThrow("effect boom");
        expect(c.peek()).toBe(a);
        write(b);
        expect(c.peek()).toBe(a);                      // still held — the timing rule survived the throw
        await expect(clock.advance(1000)).rejects.toThrow("effect boom");
        expect(c.peek()).toBe(b);
      });
    }, { timeout: 60000 });
  }
});
