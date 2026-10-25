/**
 * s470-await-residue (SECURITY, impl#1) — the two residues #1554 left, where a pending server call
 * was read before it settled.
 *
 * SPEC §13.8 (i): a waiting value stands "At a suspension point of an action position, where the
 * compiler awaits it. … A suspension point is a place where the compiler can end a statement, wait,
 * and resume with what follows". The statements after a suspension point observe the settled value.
 *
 * 1. ORDER (g-sync-action-body-fire-and-forget-ordering-s470). #1554 kept two shapes in a body
 *    impl#1 runs synchronously — a whole cell write `@c = f(…)` (lifted into a DETACHED
 *    `(async () => …)()`) and a bare call — and a later statement of the same body read the cell
 *    from before the call (a stale TRUE logged a wrong password in). Now:
 *    - `<timer>` / `<poll>` / `<timeout>` bodies, state-child `effect=` and `<onTransition>` bodies
 *      get an async host (`colorAsyncActionBody`): the call is awaited in place, in order;
 *      `on mount { }` colours with the handler-root policy (only a sole write stays detached).
 *    - module-init statements (one order across the file — a `<request>` body, an `<onMount>` tag, a
 *      runtime `^{ }` included) and a message arm stay synchronous: such a site is refused
 *      (E-IMPL1-ACTION-NOT-AWAITED) when a later statement of the body observes it.
 * 2. RESET (g-cell-init-reset-thunk-holds-promise-s470). Measured: the cell never holds the Promise
 *    (the runtime settles a thenable detached), but `reset(@v)` returns before the re-run
 *    initializer lands — the same ordering hole. A `reset` of a cell whose reset value waits is
 *    refused except as the SOLE statement of an event-handler value.
 *
 * Every REFUSED source compiled at exit 0 on main 6081e0685; the executed base/head results are in
 * docs/changes/s470-await-residue/progress.md and the security-failable-pack family f15.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const ACTION = "E-IMPL1-ACTION-NOT-AWAITED";

function compile(src) {
  const dir = resolve(tmpdir(), `scrml-s470-residue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, "app.scrml");
  writeFileSync(p, src);
  try {
    const result = compileScrml({ inputFiles: [p], write: false, outputDir: resolve(dir, "out"), log: () => {} });
    const errs = (result.errors ?? []).filter((e) => (e.severity ?? "error") === "error" && !/^[WI]-/.test(e.code ?? ""));
    const hits = errs.filter((e) => e.code === ACTION);
    const outs = [...(result.outputs?.values?.() ?? [])];
    const page = outs[outs.length - 1] ?? {};
    return { codes: [...new Set(errs.map((e) => e.code))], messages: hits.map((e) => e.message), clientJs: page.clientJs ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const page = (view, fns = "") => `type Phase:enum = { Idle, Active }
type Msg:enum = { Go }
<pw> = ""
<ok> = false
<tmp> = false
<msg> = ""
<c> = true
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function stash(q) { @tmp = isOk(q) }
    function login(p) { @pw = p${fns} }
}
<button onclick=login("wrong")>go</button>
${view}
<p>\${@msg}</p>
`;

const WRITE_TEST = `@ok = isOk(@pw); if (@ok) { @msg = "IN" }`;
const BARE_TEST = `stash(@pw); if (@tmp) { @msg = "IN" }`;
const ARM = (b) => `<engine for=Phase initial=.Idle accepts=Msg>\n  <Idle rule=.Active>\n    | .Go :> { ${b}; .Active }\n    | _ :> @phase\n  </>\n  <Active rule=.Idle>\n    | _ :> @phase\n  </>\n</>`;

describe("s470-await-residue — ORDER: a synchronous body's un-waited call followed by an observer is refused", () => {
  const REFUSED = {
    "module init: write then test": `\${ ${WRITE_TEST} }`,
    "module init: helper write then test": `\${ @ok = allowed(@pw); if (@ok) { @msg = "IN" } }`,
    "module init: bare call then test": `\${ ${BARE_TEST} }`,
    "module init: write, then a test in a LATER block": `\${ @ok = isOk(@pw) }\n\${ if (@ok) { @msg = "IN" } }`,
    "module init: write, then a cell declared from it": `\${ @ok = isOk(@pw) }\n<copy> = @ok`,
    "module init: write, then a const initialised from it": `\${ @ok = isOk(@pw)\n const v = @ok }`,
    "module init: write in a loop (the next iteration follows)": `\${ for (const x of [1, 2]) { @ok = isOk(@pw) } }`,
    "module init: bare call then another call (save; load)": `\${ stash(@pw); @ok = isOk(@pw) }`,
    "module init: write under if, test after the if": `\${ if (@c) { @ok = isOk(@pw) }\n if (@ok) { @msg = "IN" } }`,
    "module init: guarded write then test": `\${ @ok = isOk(@pw) !{ _ :> false }\n if (@ok) { @msg = "IN" } }`,
    "<request> body: write then test": `<request id="r" deps=[@pw]>\${ ${WRITE_TEST} }</>`,
    "<onMount> tag: write then test": `<onMount>\${ ${WRITE_TEST} }</>`,
    "message arm: write then test": ARM(WRITE_TEST),
    "message arm: bare call then test": ARM(BARE_TEST),
    // Bodies that run DURING module init follow the module-init statements before them.
    "module init write, then a <request> body that reads it": `\${ @ok = isOk(@pw) }\n<request id="r" deps=[@pw]>\${ @tmp = allowed(@pw)\n if (@ok) { @msg = "IN" } }</>`,
    "module init write, then a <poll> (immediate first tick) that reads it": `\${ @ok = isOk(@pw) }\n<poll interval=1000>\${ if (@ok) { @msg = "IN" } }</poll>`,
    "module init write, then an engine opener effect= that reads it": `\${ @ok = isOk(@pw) }\n<engine for=Phase initial=.Idle effect=\${ if (@ok) { @msg = "IN" } }>\n  <Idle rule=.Active/>\n  <Active/>\n</>`,
    "module init write, then an on mount block that reads it": `\${ @ok = isOk(@pw) }\n\${\n  on mount {\n    if (@ok) { @msg = "IN" }\n  }\n}`,
    "runtime ^{ }: bare call then test": `^{ ${BARE_TEST} }`,
  };
  for (const [name, view] of Object.entries(REFUSED)) {
    test(`REFUSED — ${name}`, () => {
      const r = compile(page(view));
      expect(r.codes).toContain(ACTION);
      expect(r.messages.some((m) => /does not wait for it/.test(m) && /§13\.8 \(i\)/.test(m))).toBe(true);
    });
  }

  const ACCEPTED = {
    "module init: a sole write": `\${ @ok = isOk(@pw) }`,
    "module init: a write, then only declarations and literals": `\${ @ok = isOk(@pw) }\n<n> = 0\n\${ function shown() { return @ok } }`,
    "module init: a write in one branch, a literal write in the other": `\${ if (@c) { @ok = isOk(@pw) } else { @msg = "none" } }`,
    "module init: a write, then markup that renders the cell": `\${ @ok = isOk(@pw) }\n<span if=\${@ok}>IN</span>`,
    "message arm: a write, then the next state": ARM(`@ok = isOk(@pw)`),
    // A `<timer>` tick runs after module init (each tick re-reads the cell).
    "module init write, then a <timer> that reads it": `\${ @ok = isOk(@pw) }\n<timer interval=1000>\${ if (@ok) { @msg = "IN" } }</timer>`,
    // A `<request>` body's whole write is its settle machine's LOAD into the cell (like a cell
    // declaration's): a later module-init statement reads the cell's declared value, as it would
    // before any load. Two requests are independent loads.
    "<request> load, then a module-init read of the cell": `<request id="r" deps=[@pw]>\${ @ok = isOk(@pw) }</>\n\${ if (@ok) { @msg = "IN" } }`,
    "two <request> loads": `<request id="r" deps=[@pw]>\${ @ok = isOk(@pw) }</>\n<request id="q" deps=[@pw]>\${ @tmp = isOk(@pw) }</>`,
    "module init: a write, then a literal write to another cell": `\${ @ok = isOk(@pw)\n @msg = "x" }`,
  };
  for (const [name, view] of Object.entries(ACCEPTED)) {
    test(`ACCEPTED — ${name}`, () => {
      const r = compile(page(view));
      expect(r.codes).not.toContain(ACTION);
    });
  }
});

describe("s470-await-residue — ORDER: async-hosted bodies await the call in place", () => {
  const HOSTS = {
    "<timer>": [(b) => `<timer interval=10>\${ ${b} }</timer>`, ""],
    "<poll>": [(b) => `<poll interval=10>\${ ${b} }</poll>`, ""],
    "<timeout>": [(b) => `<timeout delay=10>\${ ${b} }</>`, ""],
    "state-child effect=": [(b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active effect=\${ ${b} }/>\n  <Active/>\n</>`, "; @phase = .Active"],
    "<onTransition>": [(b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>\n</>`, "; @phase = .Active"],
  };
  for (const [host, [h, fns]] of Object.entries(HOSTS)) {
    for (const [shape, body] of [["write then test", WRITE_TEST], ["bare call then test", BARE_TEST]]) {
      test(`${host}: ${shape} — compiles, awaited in place inside an async scope`, () => {
        const r = compile(page(h(body), fns));
        expect(r.codes).toEqual([]);
        const js = r.clientJs;
        // The body's own async scope, the call awaited, and NOT the detached lift for this write.
        expect(js).toMatch(/\(async \(\) => \{\n/);
        expect(js).toMatch(shape.startsWith("write") ? /reactive_set\("ok", (_scrml_live\()?await _scrml_fetch_isOk_\d+\(/ : /await _scrml_stash_\d+\(/);
        expect(js).not.toMatch(/\(async \(\) => _scrml_(cs_)?reactive_set\("ok"/);
        // The test reads the cell AFTER the awaited write, in the same async scope.
        const at = js.search(shape.startsWith("write") ? /reactive_set\("ok", (_scrml_live\()?await/ : /await _scrml_stash_/);
        const test = js.indexOf(shape.startsWith("write") ? 'reactive_get("ok"))' : 'reactive_get("tmp"))', at);
        expect(at).toBeGreaterThan(-1);
        expect(test).toBeGreaterThan(at);
      });
    }
  }

  test("on mount { }: a write followed by a test is awaited in place (not the detached lift)", () => {
    const r = compile(page(`\${\n  on mount {\n    @ok = isOk(@pw)\n    if (@ok) { @msg = "IN" }\n  }\n}`));
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/reactive_set\("ok", await _scrml_fetch_isOk_\d+\(/);
    expect(r.clientJs).not.toMatch(/\(async \(\) => _scrml_(cs_)?reactive_set\("ok"/);
  });

  test("on mount { }: a SOLE write keeps the fire-and-forget lift (S450 sole-root rule)", () => {
    const r = compile(page(`\${\n  on mount {\n    @ok = isOk(@pw)\n  }\n}`));
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/\(async \(\) => _scrml_(cs_)?reactive_set\("ok", await _scrml_fetch_isOk_\d+\(/);
  });

  test("<timer>: a body with no async call is emitted unchanged (no async scope)", () => {
    const r = compile(page(`<timer interval=10>\${ @msg = "tick" }</timer>`));
    expect(r.codes).toEqual([]);
    expect(r.clientJs).not.toMatch(/\(async \(\) => \{/);
  });
});

describe("s470-await-residue — RESET of a cell whose reset value waits", () => {
  const P = (decl, fnBody, view = "") => `<pw> = ""
<msg> = ""
${decl}
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p; ${fnBody} }
}
<button onclick=login("wrong")>go</button>
${view}
<p>\${@msg}</p>
`;
  const REFUSED = {
    "in a function body, then a test": P(`<v> = isOk(@pw)`, `reset(@v); if (@v) { @msg = "IN" }`),
    "in a function body, last statement (its caller goes on)": P(`<v> = isOk(@pw)`, `reset(@v)`),
    "initializer through an async helper": P(`<v> = allowed(@pw)`, `reset(@v)`),
    "default= waits": P(`<v default=isOk(@pw)> = false`, `reset(@v)`),
    "a compound whose child waits": P(`<form>\n  <w> = isOk(@pw)\n</>`, `reset(@form)`),
    "a compound child by path": P(`<form>\n  <w> = isOk(@pw)\n</>`, `reset(@form.w)`),
    "in a when body": P(`<v> = isOk(@pw)`, ``, `\${ when @pw changes { reset(@v); if (@v) { @msg = "IN" } } }`),
    "in a timer body": P(`<v> = isOk(@pw)`, ``, `<timer interval=10>\${ reset(@v) }</timer>`),
    "in a multi-statement handler": P(`<v> = isOk(@pw)`, ``, `<button onclick=\${ reset(@v); @msg = "x" }>r</button>`),
  };
  for (const [name, src] of Object.entries(REFUSED)) {
    test(`REFUSED — ${name}`, () => {
      const r = compile(src);
      expect(r.codes).toContain(ACTION);
      expect(r.messages.some((m) => /reset\(@/.test(m) && /re-runs the initializer/.test(m))).toBe(true);
    });
  }
  const ACCEPTED = {
    "the sole statement of a handler (interpolation)": P(`<v> = isOk(@pw)`, ``, `<button onclick=\${ reset(@v) }>r</button>`),
    "a cell whose initializer does not wait": P(`<v> = false`, `reset(@v); if (@v) { @msg = "IN" }`),
    "default= does not wait (the initializer would)": P(`<v default=false> = isOk(@pw)`, `reset(@v)`),
  };
  for (const [name, src] of Object.entries(ACCEPTED)) {
    test(`ACCEPTED — ${name}`, () => {
      const r = compile(src);
      expect(r.codes).not.toContain(ACTION);
    });
  }
});
