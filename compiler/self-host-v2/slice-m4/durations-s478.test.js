// durations-s478.test.js — s478-boot-durations (triage cluster C9): DURATION values and the two
// consumers the conformance cases need — `debounced=` / `throttled=` (§6.13) on a program cell and
// the `<onIdle after= to=>` engine watchdog (§51.0.R).
//
// SPEC §6.13.3: "| Literal | `300ms`, `2s`, `1m`, `1h` | Constant-folded to integer milliseconds at
// compile time." §51.12.3: "The unit suffix is required" · "Fractional numbers are permitted (`0.5s`
// is 500 ms)". §6.13.6: "A literal-form DURATION that does not parse SHALL produce a compile error"
// (E-SYNTAX-DURATION, §34) · "`debounced=` AND `throttled=` on the same state-decl SHALL fire
// `E-REACTIVITY-ATTR-CONFLICT`" · "`debounced=` / `throttled=` on a `const`-derived state-decl SHALL
// fire `E-DEBOUNCED-WITH-DERIVED`". §6.13.1: "Each new write within the window restarts the timer;
// the cell's value updates exactly once, after the window of silence." §6.13.2: "The first write in
// any window emits immediately; subsequent writes within DURATION of the last emit are suppressed but
// the most recent suppressed value is held. At the end of the window a single trailing write emits".
// §51.0.R: "Armed at module-init … Reset on every successful transition … One per engine maximum —
// multiple `<onIdle>` declarations fire `E-IDLE-DUPLICATE`" · "`to=.Variant` … MUST be a variant of
// the engine's `for=` enum" (E-IDLE-INVALID-VARIANT) · "Inside a state-child body fires
// `E-IDLE-MISPLACED`".
//
// Red on base (origin/main af7fe4bab): every `300ms` / `5m` value was E-PARSE-TRAILING ("unexpected
// `ms` after the expression"); `debounced=` was refused as an unknown opener word; `<onIdle>` was
// E-DECL-STATE-CHILD ("not a variant"); `rt.timed` / `rt.idleWatch` did not exist.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { FakeClock } from "../../../conformance/fake-clock.ts";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const P = (body, main = `<p>x</p>`) => `<program>\n${body}\n<main>${main}</main>\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.code.startsWith("E-"));
const codes = (src) => errs(src).map((d) => d.code);
const USE = `<p>\${@x}</p><button onclick=f()>f</button>`;
const cell = (attrs) => P(`let <x:int=0 ${attrs}/>\nfunction f() { @x = 1; }`, USE);
const fieldOf = (src, name) => {
  const r = run(src);
  expect(r.diags).toEqual([]);
  const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
  return prog.fields.find((f) => f.sym.hint === name);
};

describe("a DURATION value parses and folds to integer milliseconds (§6.13.3, §51.12.3)", () => {
  for (const [text, ms] of [["300ms", 300], ["2s", 2000], ["1m", 60000], ["1h", 3600000], ["0.5s", 500], ["1.25s", 1250], ["0ms", 0]]) {
    test(`debounced=${text} → ${ms} ms, no diagnostic`, () => {
      expect(fieldOf(cell(`debounced=${text}`), "x").timing).toEqual({ throttle: false, ms });
    });
  }
  test("throttled=100ms → a throttle timing", () => {
    expect(fieldOf(cell("throttled=100ms"), "x").timing).toEqual({ throttle: true, ms: 100 });
  });
  test("a cell without a timing word has none", () => {
    expect(fieldOf(cell(""), "x").timing).toBeNull();
  });
});

describe("E-SYNTAX-DURATION — a DURATION that does not parse (§6.13.6)", () => {
  for (const v of ["300sec", "300", "5M", "-5s", ".5s", "1.s", "abc", "(300)", "\"fast\""]) {
    test(`debounced=${v}`, () => {
      const e = errs(cell(`debounced=${v}`));
      expect(e.map((d) => d.code)).toEqual(["E-SYNTAX-DURATION"]);
      expect(e[0].message).toContain("§6.13.3");
    });
  }
  test("on `<onIdle after=…>` too", () => {
    const src = P(`type Phase:enum = { Active, Idle }\n<phase:Phase=.Active single>\n<Active rule=.Idle></>\n<Idle rule=.Active></>\n<onIdle after=5min to=.Idle/>\n</>`, `<p>\${@phase}</p>`);
    expect(codes(src)).toEqual(["E-SYNTAX-DURATION"]);
  });
});

describe("§6.13.5 composition codes", () => {
  test("debounced= AND throttled= → E-REACTIVITY-ATTR-CONFLICT", () => {
    expect(codes(cell("debounced=300ms throttled=100ms"))).toEqual(["E-REACTIVITY-ATTR-CONFLICT"]);
  });
  test("on a derived cell → E-DEBOUNCED-WITH-DERIVED", () => {
    const src = P(`let <x:int=0/>\n<d:int=(@x * 2) debounced=300ms/>\nfunction f() { @x = 1; }`, `<p>\${@d}</p><button onclick=f()>f</button>`);
    expect(codes(src)).toEqual(["E-DEBOUNCED-WITH-DERIVED"]);
  });
  test("on a `server` cell → E-DEBOUNCED-WITH-SERVER (beside the bootstrap's own `server` refusal)", () => {
    const c = codes(cell("server debounced=300ms"));
    expect(c).toContain("E-DEBOUNCED-WITH-SERVER");
  });
});

describe("refused BY NAME — compositions whose rule the runtime does not build (INTERIM)", () => {
  const refused = (src, needle) => {
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain(needle);
  };
  test("a computed DURATION `${expr}ms` (§51.12.3.1)", () => {
    refused(P(`let <d:int=300/>\nlet <x:int=0 debounced=\${@d}ms/>\nfunction f() { @x = 1; }`, USE), "computed DURATION");
  });
  test("a field of a user declaration", () => {
    const e = errs(P(`<card title:string>\n  let <n:int=0 debounced=300ms/>\n</card>`, `<p>x</p>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("a declaration or a field of one");
  });
  test("a `persist=` cell", () => {
    refused(cell(`persist="local" key="app.x" debounced=300ms`), "a `persist=` cell");
  });
  test("`reset(@x)` of a timed cell (§6.8.2 cancel-then-apply)", () => {
    refused(P(`let <x:int=0 debounced=300ms/>\nfunction f() { @x = 1; }\nfunction g() { reset(@x); }`, `${USE}<button onclick=g()>g</button>`), "§6.8.2");
  });
  test("a `reset-on=` target", () => {
    refused(P(`let <q:int=0/>\nlet <x:int=0 debounced=300ms reset-on=[@q]/>\nfunction f() { @x = 1; @q = 2; }`, USE), "reset-on=");
  });
  test("a duration on an element that is no consumer (`<div after=5m>`)", () => {
    refused(P(``, `<div after=5m>x</div>`), "a duration is the value");
  });
});

describe("r1 fix round (review s478-1875)", () => {
  // F1 — a delay above 2147483647 ms is clamped to 1 ms by the host timer: the timing would invert.
  // §51.12.3 states no range, so it is refused by name (INTERIM), naming the maximum.
  for (const v of ["1000h", "99999999999999999999h", "2147483648ms"]) {
    test(`F1 debounced=${v} → refused by name, naming the max`, () => {
      const e = errs(cell(`debounced=${v}`));
      expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(e[0].message).toContain("2147483647");
    });
  }
  test("F1 the maximum itself compiles", () => {
    expect(fieldOf(cell("debounced=2147483647ms"), "x").timing).toEqual({ throttle: false, ms: 2147483647 });
  });
  test("F1 <onIdle after=600h> → refused by name", () => {
    const src = P(`type Phase:enum = { Active, Idle }\n<phase:Phase=.Active single>\n<Active rule=.Idle></>\n<Idle rule=.Active></>\n<onIdle after=600h to=.Idle/>\n</>`, `<p>\${@phase}</p>`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("2147483647");
  });
  // F2 — an ignored `<program>` attribute still has its malformed DURATION reported.
  const prog = (open) => run(`${open}\nlet <x:int=0/>\n<main><p>\${@x}</p></main>\n</program>\n`).diags.map((d) => d.code);
  test("F2 <program after=5zz> → W-ATTR-001 + E-SYNTAX-DURATION", () => {
    expect(prog("<program after=5zz>").sort()).toEqual(["E-SYNTAX-DURATION", "W-ATTR-001"]);
  });
  test("F2 <program debounced=300ms> → only W-ATTR-001 (well-formed, ignored)", () => {
    expect(prog("<program debounced=300ms>")).toEqual(["W-ATTR-001"]);
  });
  // F5 — §6.13 rules no timing wrapper over an engine's transitions.
  test("F5 debounced= on an engine → refused by name", () => {
    const src = P(`type Phase:enum = { Active, Idle }\n<phase:Phase=.Active single debounced=300ms>\n<Active rule=.Idle></>\n<Idle rule=.Active></>\n</>`, `<p>\${@phase}</p>`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("an engine");
  });
});

describe("`<onIdle>` (§51.0.R) — the static rules", () => {
  const ENG = (idles, extra = "") => P(`type Phase:enum = { Active, Idle }\n<phase:Phase=.Active single>\n<Active rule=.Idle>${extra}</>\n<Idle rule=.Active></>\n${idles}\n</>`, `<p>\${@phase}</p>`);
  test("one legal watchdog compiles clean and lowers to graph.idle", () => {
    const f = fieldOf(ENG(`<onIdle after=5m to=.Idle/>`), "phase");
    expect(f.graph.idle).toEqual({ ms: 300000, to: 1 });
  });
  test("no watchdog → graph.idle is not", () => {
    expect(fieldOf(ENG(``), "phase").graph.idle).toBeNull();
  });
  test("two → E-IDLE-DUPLICATE (once, on the second)", () => {
    expect(codes(ENG(`<onIdle after=5m to=.Idle/>\n<onIdle after=10m to=.Idle/>`))).toEqual(["E-IDLE-DUPLICATE"]);
  });
  test("to= not a variant → E-IDLE-INVALID-VARIANT", () => {
    expect(codes(ENG(`<onIdle after=5m to=.Sleeping/>`))).toEqual(["E-IDLE-INVALID-VARIANT"]);
  });
  test("no to= → E-IDLE-INVALID-VARIANT (§34: \"or `to=` is missing\")", () => {
    expect(codes(ENG(`<onIdle after=5m/>`))).toEqual(["E-IDLE-INVALID-VARIANT"]);
  });
  test("inside a state-child body → E-IDLE-MISPLACED", () => {
    expect(codes(ENG(``, `<onIdle after=5m to=.Idle/>`))).toEqual(["E-IDLE-MISPLACED"]);
  });
  test("in markup → E-IDLE-MISPLACED (§4.15: the element's specific misplacement code)", () => {
    expect(codes(P(`let <x:int=0/>`, `<onIdle after=5m to=.Idle/><p>\${@x}</p>`))).toEqual(["E-IDLE-MISPLACED"]);
  });
  test("no after= → refused by name (no named code)", () => {
    expect(codes(ENG(`<onIdle to=.Idle/>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("another attribute → refused by name, never ignored", () => {
    expect(codes(ENG(`<onIdle after=5m to=.Idle name="w"/>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// ---------------------------------------------------------------------------
// The runtime, under the conformance harness's virtual clock.
// ---------------------------------------------------------------------------
const TIMED = (attr) => P(`let <n:int=0/>\nlet <val:int=0 ${attr}/>\nfunction bump() { @n = @n + 1; @val = @n; }`,
  `<p id="v">\${@val}</p><button id="b" onclick=bump()>b</button>`);
const val = () => document.querySelector("#v").textContent;
const bump = () => click(document.querySelector("#b"));

async function withClock(src, name, body) {
  const clock = new FakeClock();
  clock.install();
  try {
    const r = run(src);
    expect(r.diags).toEqual([]);
    const loaded = await loadProgram(r.core, name, []);
    await body(clock, loaded);
  } finally {
    clock.restore();
  }
}

describe("debounced= — one trailing commit after the window of silence (§6.13.1)", () => {
  test("three writes coalesce; nothing commits until 1s after the last; then the latest", async () => {
    await withClock(TIMED("debounced=1s"), "debounce", async (clock) => {
      bump(); bump();
      await clock.advance(600);
      bump();                                   // restarts the window
      expect(val()).toBe("0");
      await clock.advance(999);
      expect(val()).toBe("0");
      await clock.advance(1);
      expect(val()).toBe("3");
    });
  }, { timeout: 60000 });
});

describe("throttled= — leading emit, one trailing emit of the held value (§6.13.2)", () => {
  test("the first write lands at once; later writes in the window are held; the latest lands at window end", async () => {
    await withClock(TIMED("throttled=1s"), "throttle", async (clock) => {
      bump();
      expect(val()).toBe("1");
      bump(); bump();
      expect(val()).toBe("1");
      await clock.advance(1000);
      expect(val()).toBe("3");
      await clock.advance(5000);
      bump();                                   // a quiescent window again: leading
      expect(val()).toBe("4");
    });
  }, { timeout: 60000 });
});

describe("`<onIdle>` — armed at construction, reset by each transition, fires `to=` (§51.0.R)", () => {
  const SRC = P(`type Phase:enum = { Active, Idle }\n<phase:Phase=.Active single>\n<Active rule=.Idle></>\n<Idle rule=.Active></>\n<onIdle after=1s to=.Idle/>\n</>\nfunction nap() { @phase = .Idle; }\nfunction wake() { @phase = .Active; }`,
    `<p id="s">\${@phase}</p><button id="n" onclick=nap()>n</button><button id="w" onclick=wake()>w</button>`);
  const state = () => document.querySelector("#s").textContent;
  test("fires after 1s of silence", async () => {
    await withClock(SRC, "idle1", async (clock) => {
      expect(state()).toBe("Active");
      await clock.advance(999);
      expect(state()).toBe("Active");
      await clock.advance(1);
      expect(state()).toBe("Idle");
    });
  }, { timeout: 60000 });
  test("a transition resets it: the full duration from the last transition", async () => {
    await withClock(SRC, "idle2", async (clock) => {
      click(document.querySelector("#n"));      // Active → Idle
      await clock.advance(500);
      click(document.querySelector("#w"));      // Idle → Active: reset
      await clock.advance(999);
      expect(state()).toBe("Active");
      await clock.advance(1);
      expect(state()).toBe("Idle");
    });
  }, { timeout: 60000 });
});
