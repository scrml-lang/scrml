/**
 * S470 (ruling: user-voice-scrml.md S470 "Emit E-ERROR-012 (Recommended)"; S435 security exception) —
 * SPEC §19.4.3 / §19.4.4: in a VALUE position (`let r = f() !{ … }`, `@x = f() !{ … }`, a `return`
 * operand, an argument, `let m = match f() { … }`) every arm of a `!{ }` handler or of a `match` on a
 * failable call SHALL yield a value of the success type or leave (`return` / `fail`); an arm that does
 * neither falls through and is **E-ERROR-012**. impl#1 never emitted it: it ran the arm, then wrote the
 * call's raw result — on a handled failure the ERROR ENVELOPE, a truthy object — into the target
 * (`g-handled-error-arm-failure-writes-envelope-into-cell`, `g-impl1-value-position-arm-fallthrough-
 * s451`), so `@ok = check(@pw) !{ .Denied(r) :> { @msg = "no" } }` then `if (@ok)` logged a wrong
 * password in — in a handler, a helper function called from an engine hook or a `<timer>`, the opener
 * `effect=` (review of 4abccb31d, atk.mjs / hh.mjs; the handler / opener twins failed on main too).
 * Statement position stays legal: `f() !{ … }` alone may fall through.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const CODE = "E-ERROR-012";

function compile(src, mode) {
  const dir = resolve(tmpdir(), `scrml-e012-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, "app.scrml");
  writeFileSync(p, src);
  try {
    const result = compileScrml({ inputFiles: [p], write: false, outputDir: resolve(dir, "out"), log: () => {}, ...(mode ? { mode } : {}) });
    const errs = (result.errors ?? []).filter((e) => (e.severity ?? "error") === "error");
    return { codes: [...new Set(errs.map((e) => e.code))], messages: errs.filter((e) => e.code === CODE).map((e) => e.message) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HDR = `type Phase:enum = { Idle, Active }
type AuthErr:enum = { Denied(reason: string), Gone }
<pw> = ""
<ok> = false
<msg> = ""
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
`;
const TAIL = `<button onclick=login("x")>go</button>\n<p>\${@msg}</p>\n`;
const page = (fns, view = "") => `${HDR}${fns}\n}\n${view}${TAIL}`;
const LOGIN = `    function login(p) { @pw = p; @phase = .Active }`;
const ONT = (b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active rule=.Idle/>\n  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>\n</>\n`;

describe("E-ERROR-012 — a value-position `!{ }` arm that falls through", () => {
  const FALLS = {
    "a write": `.Denied(r) :> @msg = "no", _ :> false`,
    "a block of writes": `.Denied(r) :> { @msg = "no" }, _ :> false`,
    "an empty block": `.Denied(r) :> { }, _ :> false`,
    "a declaration": `.Denied(r) :> { let q = r }, _ :> false`,
    "a loop": `.Denied(r) :> { for (x of [1]) { @msg = "no" } }, _ :> false`,
    "an if with one leaving branch": `.Denied(r) :> { if (r == "bad") { return } }, _ :> false`,
  };
  for (const [name, arms] of Object.entries(FALLS)) {
    test(`REFUSED — a cell write, the arm ends in ${name}`, () => {
      const r = compile(page(`    function login(p) { @ok = check(p) !{ ${arms} }\n if (@ok) { @msg = "IN" } }`));
      expect(r.codes).toContain(CODE);
      expect(r.messages[0]).toMatch(/Arm '\.Denied\(r\)' of the handler on 'check\(…\)' produces no value/);
      expect(r.messages[0]).toMatch(/written to `@ok`/);
    });
  }
  const POSITIONS = {
    "a `let` binding": `let r = check(p) !{ .Denied(x) :> { @msg = "no" }, _ :> false }\n if (r) { @msg = "IN" }`,
    "a `const` binding": `const r = check(p) !{ .Denied(x) :> { @msg = "no" }, _ :> false }\n if (r) { @msg = "IN" }`,
    "a `return` operand": `return check(p) !{ .Denied(x) :> { @msg = "no" }, _ :> false }`,
  };
  for (const [name, body] of Object.entries(POSITIONS)) {
    test(`REFUSED — ${name}`, () => {
      expect(compile(page(`    function login(p) { ${body} }`)).codes).toContain(CODE);
    });
  }
  const HOSTS = {
    "a helper function called from an <onTransition>": [`    function chk(p) { @ok = check(p) !{ .Denied(r) :> { @msg = "no" }, _ :> false } }\n${LOGIN}`, ONT(`chk(@pw)\n if (@ok) { @msg = "IN" }`)],
    "a helper function called from a <timer>": [`    function chk(p) { @ok = check(p) !{ .Denied(r) :> { @msg = "no" }, _ :> false } }\n    function login(p) { @pw = p }`, `<timer interval=10>\${ chk(@pw)\n if (@ok) { @msg = "IN" } }</timer>\n`],
    "an <onTransition> body": [LOGIN, ONT(`@ok = check(@pw) !{ .Denied(r) :> { @msg = "no" }, _ :> false }\n if (@ok) { @msg = "IN" }`)],
    "the engine opener effect=": [`    function login(p) { @pw = p }`, `<engine for=Phase initial=.Idle effect=\${ @ok = check(@pw) !{ .Denied(r) :> { @msg = "no" }, _ :> false } }>\n  <Idle rule=.Active/>\n  <Active/>\n</>\n`],
    "a handler attribute value": [`    function login(p) { @pw = p }`, `<button onclick=\${ @ok = check(@pw) !{ .Denied(r) :> { @msg = "no" }, _ :> false }\n if (@ok) { @msg = "IN" } }>h</button>\n`],
  };
  for (const [name, [fns, view]] of Object.entries(HOSTS)) {
    test(`REFUSED — ${name}`, () => {
      expect(compile(page(fns, view)).codes).toContain(CODE);
    });
  }
  test("REFUSED — a server function (the server side)", () => {
    const r = compile(page(`    server function login(p) {\n        let r = check(p) !{ .Denied(x) :> { let q = x }, _ :> false }\n        return r\n    }`));
    expect(r.codes).toContain(CODE);
  });
  test("REFUSED — library mode", () => {
    const src = `type AuthErr:enum = { Denied(reason: string), Gone }
\${
    export function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    export function login(p) {
        let r = check(p) !{ .Denied(x) :> { let q = x }, _ :> false }
        return r
    }
}
`;
    expect(compile(src, "library").codes).toContain(CODE);
  });
  const YIELDS = {
    "an expression arm": `.Denied(r) :> false, _ :> false`,
    "a block ending in a value": `.Denied(r) :> { @msg = "no"\n false }, _ :> false`,
    "a block ending in return": `.Denied(r) :> { @msg = "no"; return }, _ :> { return }`,
    "a fail arm": `.Denied(r) :> fail AuthErr::Gone, _ :> false`,
  };
  for (const [name, arms] of Object.entries(YIELDS)) {
    test(`ACCEPTED — ${name}`, () => {
      expect(compile(page(`    function login(p)! -> AuthErr { @ok = check(p) !{ ${arms} }\n if (@ok) { @msg = "IN" } }`)).codes).not.toContain(CODE);
    });
  }
  test("ACCEPTED — STATEMENT position: an arm may fall through", () => {
    expect(compile(page(`    function login(p) { check(p) !{ .Denied(r) :> { @msg = "no" }, _ :> { @msg = "gone" } } }`)).codes).not.toContain(CODE);
  });
});

describe("E-ERROR-012 fix round 4 — tails the round-3 classifier took as yielding (review of 09baae43c)", () => {
  const W = (arm) => page(`    function login(p) { @ok = check(p) !{ .Denied(r) :> ${arm}, _ :> false }\n if (@ok) { @msg = "IN" } }`);
  const FALLS = {
    "a nested handled call whose own arm falls through": `{ check(p) !{ _ :> { @msg = "x" } } }`,
    "a postfix increment": `{ @seen++ }`,
    "a prefix decrement": `{ --@seen }`,
    "an assignment in parentheses": `{ (@msg = "x") }`,
    "a ternary with a write in one branch": `{ @pw == "" ? (@msg = "x") : false }`,
    "a ternary with writes in both branches": `{ @pw == "" ? (@msg = "x") : (@msg = "y") }`,
    "a write behind &&": `{ @pw == "" && (@msg = "x") }`,
    "a comma sequence ending in a write": `{ (false, @msg = "x") }`,
    "an expression arm that is an increment": `@seen++`,
  };
  for (const [name, arm] of Object.entries(FALLS)) {
    test(`REFUSED — ${name}`, () => {
      expect(compile(W(arm).replace("<msg> = \"\"", "<msg> = \"\"\n<seen> = 0")).codes).toContain(CODE);
    });
  }
  const YIELDS = {
    "a nested handled call whose arms yield": `{ check(p) !{ _ :> false } }`,
    "a ternary of values": `{ @pw == "" ? false : true }`,
    "a call inside a lambda that writes (not this tail's write)": `{ [1].some((x) => x == 2) }`,
  };
  for (const [name, arm] of Object.entries(YIELDS)) {
    test(`ACCEPTED — ${name}`, () => {
      expect(compile(W(arm)).codes).not.toContain(CODE);
    });
  }
  test("REFUSED — an expression-position failable `match` with a fall-through arm (`@ok = match check(p) { … }`)", () => {
    const r = compile(page(`    function login(p) {\n        @ok = match check(p) { .Ok(v) :> v  .Denied(r) :> { @msg = "no" }  .Gone :> false }\n        if (@ok) { @msg = "IN" }\n    }`));
    expect(r.codes).toContain(CODE);
  });
  test("ACCEPTED — an expression-position failable `match` whose arms yield", () => {
    const r = compile(page(`    function login(p) {\n        @ok = match check(p) { .Ok(v) :> v  .Denied(r) :> false  .Gone :> false }\n        if (@ok) { @msg = "IN" }\n    }`));
    expect(r.codes).not.toContain(CODE);
  });
});

describe("E-ERROR-012 — a value-position `match` on a failable call", () => {
  test("REFUSED — an arm that only writes, the match bound to a name", () => {
    const r = compile(page(`    function login(p) {\n        let m = match check(p) {\n            .Ok(v) :> v\n            .Denied(x) :> { @msg = "no" }\n            .Gone :> false\n        }\n        if (m) { @msg = "IN" }\n    }`));
    expect(r.codes).toContain(CODE);
    expect(r.messages[0]).toMatch(/of the `match` on 'check\(…\)' produces no value/);
  });
  test("ACCEPTED — every arm yields", () => {
    expect(compile(page(`    function login(p) {\n        let m = match check(p) {\n            .Ok(v) :> v\n            .Denied(x) :> false\n            .Gone :> false\n        }\n        if (m) { @msg = "IN" }\n    }`)).codes).not.toContain(CODE);
  });
});
