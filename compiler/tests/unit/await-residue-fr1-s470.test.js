/**
 * s470-await-residue fix round 1 (review of 817aadc0e, SECURITY). Every REFUSED source below compiled
 * on 817aadc0e and, by execution (security-failable-pack f23 `F1`–`F4`,
 * ../integration/await-residue-race-s470.test.js for F5), logged a wrong password in.
 *
 * F1 — the ORDER rule's observer test matched only the written cell's NAME: a later read of a DERIVED
 *      cell over it (or a derived of a derived) escaped. A derived name now observes when its closure
 *      in the compiler's dependency graph (Stage 7 DG edges) reaches the cell.
 * F2 — a reset value registered by an engine opener `effect=` write (an undeclared cell) was not seen.
 * F3 — an opener `effect=` (and a `<poll>`'s immediate tick) is emitted AFTER every module-init
 *      statement: it is checked against the whole module-init order, not the text before it.
 * F4 — a message arm's last-statement write is followed by the transition's hooks.
 * F5 — an async engine hook host is latest-wins (a superseded run does not resume).
 * F9 — the ordering message recommends `<request>`, not the deprecated `on mount { }`.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const ACTION = "E-IMPL1-ACTION-NOT-AWAITED";

function compile(src) {
  const dir = resolve(tmpdir(), `scrml-s470-fr1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, "app.scrml");
  writeFileSync(p, src);
  try {
    const result = compileScrml({ inputFiles: [p], write: false, outputDir: resolve(dir, "out"), log: () => {} });
    const errs = (result.errors ?? []).filter((e) => (e.severity ?? "error") === "error" && !/^[WI]-/.test(e.code ?? ""));
    const outs = [...(result.outputs?.values?.() ?? [])];
    return {
      codes: [...new Set(errs.map((e) => e.code))],
      messages: errs.filter((e) => e.code === ACTION).map((e) => e.message),
      clientJs: (outs[outs.length - 1] ?? {}).clientJs ?? "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const page = (view, fns = "") => `type Phase:enum = { Idle, Active }
type Msg:enum = { Go }
<pw> = ""
<ok> = false
<msg> = ""
<c> = true
\${
    server function isOk(p) { return p == "secret" }
    function okNow() { return @ok }
    function login(p) { @pw = p${fns} }
}
<button onclick=login("wrong")>go</button>
${view}
<p>\${@msg}</p>
`;
const WRITE_TEST = `@ok = isOk(@pw); if (@ok) { @msg = "IN" }`;
const ARM = (b, activeExtra = "", extra = "") => `<engine for=Phase initial=.Idle accepts=Msg>\n  <Idle rule=.Active>\n    | .Go :> { ${b}; .Active }\n    | _ :> @phase\n  </>\n  <Active rule=.Idle${activeExtra}>\n    | _ :> @phase\n  </>\n${extra}</>`;

describe("F1 — a DERIVED cell over the written cell observes it", () => {
  const REFUSED = {
    "module init: a derived over the cell": `const <authed> = @ok\n\${ @ok = isOk(@pw); if (@authed) { @msg = "IN" } }`,
    "module init: a derived of a derived": `const <a1> = @ok\nconst <a2> = @a1\n\${ @ok = isOk(@pw); if (@a2) { @msg = "IN" } }`,
    "module init: a derived through a helper function": `const <authed> = okNow()\n\${ @ok = isOk(@pw); if (@authed) { @msg = "IN" } }`,
    "module init: a derived in a ternary": `const <authed> = @ok\n\${ @ok = isOk(@pw); @msg = @authed ? "IN" : "out" }`,
    "a <request> body: the load, then a derived": `const <authed> = @ok\n<request id="r" deps=[@pw]>\${ @ok = isOk(@pw); if (@authed) { @msg = "IN" } }</>`,
    "an <onMount> tag: a write, then a derived": `const <authed> = @ok\n<onMount>\${ @ok = isOk(@pw); if (@authed) { @msg = "IN" } }</>`,
    "a message arm: a write, then a derived": `const <authed> = @ok\n${ARM(`@ok = isOk(@pw); if (@authed) { @msg = "IN" }`)}`,
  };
  for (const [name, view] of Object.entries(REFUSED)) {
    test(`REFUSED — ${name}`, () => {
      expect(compile(page(view)).codes).toContain(ACTION);
    });
  }
  test("ACCEPTED — a derived over ANOTHER cell does not observe the write", () => {
    expect(compile(page(`const <shout> = @msg + "!"\n\${ @ok = isOk(@pw); if (@shout == "x") { @c = false } }`)).codes).not.toContain(ACTION);
  });
});

describe("F2 — a reset value registered by an engine opener effect= write", () => {
  const OP = (opener, fnBody) => `type Phase:enum = { Idle, Active }
<pw> = "secret"
<msg> = ""
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p; ${fnBody} }
}
<engine for=Phase initial=.Idle effect=\${
    ${opener}
}>
  <Idle rule=.Active/>
  <Active/>
</>
<button onclick=login("wrong")>go</button>
<p>\${@msg}</p>
`;
  test("REFUSED — an undeclared cell the opener writes from a server call, reset then read", () => {
    expect(compile(OP(`@ok = isOk(@pw)`, `reset(@ok); if (@ok) { @msg = "IN" }`)).codes).toContain(ACTION);
  });
  test("REFUSED — the opener writes it through an expression", () => {
    expect(compile(OP(`@ok = [isOk(@pw)][0]`, `reset(@ok)`)).codes).toContain(ACTION);
  });
  test("ACCEPTED — the opener writes a literal", () => {
    expect(compile(OP(`@ok = true`, `reset(@ok); if (@ok) { @msg = "IN" }`)).codes).not.toContain(ACTION);
  });
});

describe("F3 / F4 — a follower is judged where it actually runs", () => {
  test("F3 REFUSED — an opener effect= written BEFORE a module-init write", () => {
    expect(compile(page(`<engine for=Phase initial=.Idle effect=\${ if (@ok) { @msg = "IN" } }>\n  <Idle rule=.Active/>\n  <Active/>\n</>\n\${ @ok = isOk(@pw) }`)).codes).toContain(ACTION);
  });
  test("F3 REFUSED — a <poll> (immediate first tick) written before the write", () => {
    expect(compile(page(`<poll interval=1000>\${ if (@ok) { @msg = "IN" } }</poll>\n\${ @ok = isOk(@pw) }`)).codes).toContain(ACTION);
  });
  test("F4 REFUSED — an arm's last write, then the transition's <onTransition> reads the cell", () => {
    const r = compile(page(ARM(`@ok = isOk(@pw)`, "", `  <onTransition from=.Idle to=.Active>\${ if (@ok) { @msg = "IN" } }</onTransition>\n`)));
    expect(r.codes).toContain(ACTION);
    expect(r.messages.some((m) => /the arm returns its next state at once/.test(m))).toBe(true);
  });
  test("F4 REFUSED — the target state's effect= reads the cell", () => {
    expect(compile(page(ARM(`@ok = isOk(@pw)`, ` effect=\${ if (@ok) { @msg = "IN" } }`))).codes).toContain(ACTION);
  });
  // fix round 2 (F14) — refused even when no hook reads the cell: the handler that sent the message,
  // a `when @phase changes` or a chained engine may (review of 4ae8261f7, f4.mjs rows 1 / 3 / 5).
  test("F14 REFUSED — an arm's last write even when the hooks do not read the cell", () => {
    expect(compile(page(ARM(`@ok = isOk(@pw)`, "", `  <onTransition from=.Idle to=.Active>\${ @msg = "moved" }</onTransition>\n`))).codes).toContain(ACTION);
  });
});

describe("F5 — an async engine hook host is latest-wins", () => {
  const ENGS = {
    "<onTransition>": `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ ${WRITE_TEST} }</onTransition>\n</>`,
    "state-child effect=": `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active effect=\${ ${WRITE_TEST} }/>\n  <Active/>\n</>`,
    "<onTransition>, a sole write": `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ @ok = isOk(@pw) }</onTransition>\n</>`,
  };
  for (const [name, eng] of Object.entries(ENGS)) {
    test(`${name}: a module-scope run counter, checked at every resume point`, () => {
      const r = compile(page(eng, "; @phase = .Active"));
      expect(r.codes).toEqual([]);
      const js = r.clientJs;
      const m = /let (__scrml_engine_\w+_fire_hooks_run_\d+) = 0;/.exec(js);
      expect(m).not.toBeNull();
      expect(js).toContain(`const _scrml_hook_run = ++${m[1]};`);
      expect(js).toMatch(/reactive_set\("ok", _scrml_hook_live\(await _scrml_fetch_isOk_\d+\(/);
      expect(js).not.toMatch(/\(async \(\) => _scrml_(cs_)?reactive_set\("ok"/);
    });
  }
  test("<onTransition>, a guarded write: the in-place `!{ }` relocation keeps the guard", () => {
    const r = compile(page(`<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ @ok = isOk(@pw) !{ _ :> false }\n if (@ok) { @msg = "IN" } }</onTransition>\n</>`, "; @phase = .Active"));
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/let \w+ = _scrml_hook_live\(await _scrml_fetch_isOk_\d+\(/);
    expect(r.clientJs).not.toMatch(/reactive_set\("ok", _scrml_hook_live/);
  });
  test("<timer>: no run counter (each tick re-reads; a slow tick must not starve the next)", () => {
    expect(compile(page(`<timer interval=10>\${ ${WRITE_TEST} }</timer>`)).clientJs).not.toMatch(/_scrml_hook_live/);
  });
});

describe("F9 — the ordering message recommends <request>, not on mount", () => {
  test("message", () => {
    const m = compile(page(`\${ ${WRITE_TEST} }`)).messages.find((x) => /does not wait for it/.test(x)) ?? "";
    expect(m).toMatch(/<request>/);
    expect(m).not.toMatch(/on mount/);
  });
});

// ---------------------------------------------------------------------------
// fix round 2 (review of 4ae8261f7) — F13 / F14 / F18.
// ---------------------------------------------------------------------------

describe("fix round 2 — F13: a `!{ }`-handled cell write with a fall-through arm in an async-hosted body", () => {
  const H = (view, fns = "") => `type Phase:enum = { Idle, Active }
type AuthErr:enum = { Denied(reason: string), Gone }
<pw> = ""
<ok> = false
<msg> = ""
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) { @pw = p${fns} }
}
<button onclick=login("wrong")>go</button>
${view}
<p>\${@msg}</p>
`;
  const FALL = `@ok = check(@pw) !{ | .Denied(r) :> { @msg = "no" } | _ :> { @msg = "no" } }\n if (@ok) { @msg = "IN" }`;
  const VALUE = `@ok = check(@pw) !{ | .Denied(r) :> false | _ :> false }\n if (@ok) { @msg = "IN" }`;
  const HOSTS = {
    "<timer>": [(b) => `<timer interval=10>\${ ${b} }</timer>`, ""],
    "<timeout>": [(b) => `<timeout delay=10>\${ ${b} }</>`, ""],
    "state-child effect=": [(b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active effect=\${ ${b} }/>\n  <Active/>\n</>`, "; @phase = .Active"],
    "<onTransition>": [(b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>\n</>`, "; @phase = .Active"],
  };
  for (const [host, [h, fns]] of Object.entries(HOSTS)) {
    // fix round 3 (ruling S470 "Emit E-ERROR-012") — the root: §19.4.3's E-ERROR-012 for a value-position
    // arm that falls through, in every host (the round-2 syntactic refusal is removed).
    test(`REFUSED — ${host}: an arm that falls through (E-ERROR-012)`, () => {
      const r = compile(H(h(FALL), fns));
      expect(r.codes).toContain("E-ERROR-012");
    });
    test(`ACCEPTED — ${host}: every arm gives the cell a value`, () => {
      expect(compile(H(h(VALUE), fns)).codes).not.toContain(ACTION);
    });
  }
});

describe("fix round 2 — F14: a message arm refuses every un-waited write", () => {
  test("REFUSED — a write then only the next state; the message says why", () => {
    const r = compile(page(ARM(`@ok = isOk(@pw)`)));
    expect(r.codes).toContain(ACTION);
    expect(r.messages.some((m) => /the arm returns its next state at once/.test(m))).toBe(true);
  });
  test("REFUSED — a bare waiting call", () => {
    expect(compile(page(ARM(`isOk(@pw)`))).codes).toContain(ACTION);
  });
  test("ACCEPTED — a plain write in an arm", () => {
    expect(compile(page(ARM(`@msg = "go"`))).codes).not.toContain(ACTION);
  });
});

describe("fix round 2 — F18: only the write that REGISTERS the reset value makes a reset wait", () => {
  const R = (decls, fns, view = "") => `<pw> = "x"
${decls}
\${
    server function load(p) { return [1, 2] }
${fns}
}
<button onclick=refresh()>r</button>
<button onclick=clear()>c</button>
${view}
<p>\${@items.length}</p>
`;
  test("ACCEPTED (VALID) — a declared cell written from a server call in a function; reset restores the declaration", () => {
    expect(compile(R(`<items> = []`, `    function refresh() { @items = load(@pw) }\n    function clear() { reset(@items) }`)).codes).not.toContain(ACTION);
  });
  test("ACCEPTED (VALID) — the same, the reset followed by a read", () => {
    expect(compile(R(`<items> = []\n<n> = 0`, `    function refresh() { @items = load(@pw) }\n    function clear() { reset(@items); @n = @items.length }`)).codes).not.toContain(ACTION);
  });
  test("ACCEPTED (VALID) — a declared cell written from a server call at module init; reset restores the declaration", () => {
    expect(compile(R(`<items> = []`, `    function refresh() { @items = [] }\n    function clear() { reset(@items) }`, `\${ @items = load(@pw) }`)).codes).not.toContain(ACTION);
  });
  test("REFUSED — the DECLARATION waits; the message names the initializer", () => {
    const r = compile(R(`<items> = load(@pw)`, `    function refresh() { @items = [] }\n    function clear() { reset(@items) }`));
    expect(r.codes).toContain(ACTION);
    expect(r.messages.some((m) => /re-runs the initializer of `@items`/.test(m))).toBe(true);
  });
  test("REFUSED — an UNDECLARED cell whose registering module-init write waits; the message names the write", () => {
    const r = compile(R(``, `    function refresh() { @items = [] }\n    function clear() { reset(@items) }`, `\${ @items = load(@pw) }`));
    expect(r.codes).toContain(ACTION);
    expect(r.messages.some((m) => /registers the reset value of the undeclared cell `@items`/.test(m))).toBe(true);
  });
});
