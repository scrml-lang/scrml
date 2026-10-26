/**
 * s470-nested-handler-await (SECURITY, impl#1) — a waiting call inside a `!{ }` handler ARM.
 *
 * SPEC §13.8 "The rule": a waiting value SHALL stand only "(i) At a suspension point of an action
 * position, where the compiler awaits it" … "Everywhere else a waiting value SHALL be a compile
 * error"; impl#1 refuses with E-IMPL1-ACTION-NOT-AWAITED where its emitter has no async host. An arm
 * of a `!{}` handler is code that runs in the guarded statement's host.
 *
 * On main 29fcaac8a a CLIENT arm body was lowered in an empty context (emit-logic `emitArmBody`:
 * `_makeExprCtx({})`, `rewriteBlockBody`, a nested guard re-parsed with `{ boundary: "client" }`), so
 * `check(p) !{ _ :> check("x") !{ _ :> false } }` emitted the inner call as
 * `let r = _scrml_fetch_check_5("x")` inside a synchronous IIFE: the arm yielded a pending Promise —
 * always truthy — and a wrong password logged in (lane C review F2). An async helper in an arm was
 * the same. In a `when` body / the engine opener `effect=` the action-body walk counted an arm's call
 * as awaited although the arm lowering does not await it. A value-position block arm ending in
 * `lift r` around a nested handler was emitted as a MARKUP lift in an event handler.
 *
 * Executed proof: compiler/tests/integration/security-failable-pack r18 (s21 / f24 / l16 / t16).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { compileScrml } from "../../src/api.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/nested-handler-await-s470");
beforeAll(() => mkdirSync(FIXTURE_DIR, { recursive: true }));
afterAll(() => { try { rmSync(FIXTURE_DIR, { recursive: true, force: true }); } catch {} });

const ACTION = "E-IMPL1-ACTION-NOT-AWAITED";
let n = 0;

function compile(src, mode) {
  const name = `case-${n++}`;
  const path = join(FIXTURE_DIR, name + ".scrml");
  writeFileSync(path, src);
  const result = compileScrml({ inputFiles: [path], write: false, log: () => {}, ...(mode ? { mode } : {}) });
  let js = "";
  for (const [fp, out] of result.outputs) {
    if (fp.endsWith(`${name}.scrml`)) { js = (mode === "library" ? out.libraryJs : out.clientJs) ?? ""; break; }
  }
  const errors = (result.errors || []).filter((e) => e.severity !== "warning" && e.severity !== "info");
  return { js, codes: errors.map((e) => e.code), messages: errors.map((e) => e.message) };
}

const DECLS = `type AuthErr:enum = { Denied(reason: string), Gone }
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    server function isOk(p) { return p == "secret" }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function allowed(p) { return isOk(p) }`;

const fnPage = (body) => `<msg> = "init"
\${
    ${DECLS}
    function login(p) {
        ${body}
    }
    function go(p) { @msg = login(p) }
}
<button onclick=go("wrong")>go</button>
<p>\${@msg}</p>
`;

/** The emitted body of the client `login` function. */
const loginOf = (js) => {
  const m = /async function _scrml_login_\d+\(p\) \{[\s\S]*?\n\}\n/.exec(js);
  return m ? m[0] : "";
};

describe("a client function body: the arm is awaited in place", () => {
  test("the review repro — a nested handler in an arm awaits the inner call", () => {
    const { js, codes } = compile(fnPage(`const v = check(p) !{ _ :> check("x") !{ _ :> false } }
        return v ? "LOGGED IN" : "rejected"`));
    expect(codes).toEqual([]);
    const body = loginOf(js);
    expect(body).toMatch(/await _scrml_fetch_check_\d+\("x"\)/);
    expect(body).toMatch(/\(await \(async \(\) => \{/);
    expect(body).not.toMatch(/= _scrml_fetch_check_\d+\("x"\)/);
  });

  for (const [pn, arm] of [
    ["_", (a) => `_ :> ${a}`],
    ["_ e", (a) => `_ e :> ${a}`],
    [".Denied(r)", (a) => `.Denied(r) :> ${a}, _ :> false`],
  ]) {
    test(`${pn} arm: an async helper is awaited`, () => {
      const { js, codes } = compile(fnPage(`const v = check(p) !{ ${arm("allowed(p)")} }
        return v ? "LOGGED IN" : "rejected"`));
      expect(codes).toEqual([]);
      expect(loginOf(js)).toMatch(/= await _scrml_allowed_\d+\(p\)/);
    });
    test(`${pn} arm, sync outer callee: a nested handler is awaited (the host is async because of the arm)`, () => {
      const { js, codes } = compile(fnPage(`const v = local(p) !{ ${arm(`check(p) !{ _ :> false }`)} }
        return v ? "LOGGED IN" : "rejected"`));
      expect(codes).toEqual([]);
      const body = loginOf(js);
      expect(body).toMatch(/await _scrml_fetch_check_\d+\(p\)/);
      expect(body).not.toMatch(/= _scrml_fetch_check_\d+\(p\)/);
    });
  }

  test("a block arm writing an async helper is lowered from its statements and awaited", () => {
    const { js, codes } = compile(fnPage(`let ok = true
        local(p) !{ _ :> { ok = allowed(p) } }
        return ok ? "LOGGED IN" : "rejected"`));
    expect(codes).toEqual([]);
    expect(loginOf(js)).toMatch(/ok = await _scrml_allowed_\d+\(p\)/);
  });

  test("a value-position block arm yields with `lift` (§18.5, S469)", () => {
    const { js, codes } = compile(fnPage(`const v = local(p) !{ _ :> {
            const got = p == "secret"
            lift got
        } }
        return v ? "LOGGED IN" : "rejected"`));
    expect(codes).toEqual([]);
    expect(js).toMatch(/_scrml__scrml_result_\d+ = got;/);
    expect(js).not.toMatch(/\blift got\b/);
  });

  test("VALID — a sync arm emits no await inside the arm", () => {
    const { js, codes } = compile(fnPage(`const v = check(p) !{ _ :> false }
        return v ? "LOGGED IN" : "rejected"`));
    expect(codes).toEqual([]);
    const body = loginOf(js);
    expect(body).toMatch(/= false;/);
    expect((body.match(/\bawait\b/g) ?? []).length).toBe(1);
  });
});

describe("an event handler", () => {
  test("a block arm `{ const got = check(x) !{…}; lift got }` yields the inner value, not a markup lift", () => {
    const src = `<msg> = "init"
\${
    ${DECLS}
}
<button onclick={
        const v = check("wrong") !{ _ :> {
            const got = check("wrong") !{ _ :> false }
            lift got
        } }
        @msg = v ? "LOGGED IN" : "rejected"
    }>go</button>
<p>\${@msg}</p>
`;
    const { js, codes } = compile(src);
    expect(codes).toEqual([]);
    expect(js).not.toMatch(/_scrml_lift\(\(\) => _scrml_g\.document\.createTextNode\(_scrml_g\.String\(got/);
    expect(js).toMatch(/= got;/);
  });
});

describe("hosts impl#1 does not await an arm in: refused", () => {
  const hostPage = (logic) => `type Phase:enum = { Idle, Active }
<pw> = ""
<msg> = "rejected"
\${
    ${DECLS}
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
${logic}
<p>\${@msg}</p>
`;
  for (const [hn, wrap] of [
    ["a `when … changes` body", (b) => `\${ when @pw changes {
        ${b}
    } }`],
    ["the engine opener effect=", (b) => `<engine for=Phase initial=.Idle effect=\${
        ${b}
    }>
  <Idle rule=.Active/>
  <Active/>
</>`],
  ]) {
    for (const [an, stmt] of [
      ["writes a server call", `let ok = true
        local(@pw) !{ _ :> { ok = isOk(@pw) } }
        @msg = ok ? "LOGGED IN" : "rejected"`],
      ["a nested handler statement", `let ok = true
        local(@pw) !{ _ :> { check(@pw) !{ _ :> { ok = false } } } }
        @msg = ok ? "LOGGED IN" : "rejected"`],
      ["writes an async helper", `let ok = true
        local(@pw) !{ _ :> { ok = allowed(@pw) } }
        @msg = ok ? "LOGGED IN" : "rejected"`],
      ["an arm value that is a server call", `const v = local(@pw) !{ _ :> isOk(@pw) }
        @msg = v ? "LOGGED IN" : "rejected"`],
    ]) {
      test(`${hn}: arm — ${an}`, () => {
        const { codes, messages } = compile(hostPage(wrap(stmt)));
        expect(codes).toContain(ACTION);
        expect(messages.join("\n")).toMatch(/handler arm/);
      });
    }
  }

  test("a synchronous host (a `<request>` body) refuses the arm's call (#1554 walk reaches arms)", () => {
    const { codes } = compile(hostPage(`<request id="r" deps=[@pw]>\${
        const v = local(@pw) !{ _ :> isOk(@pw) }
        @msg = v ? "LOGGED IN" : "rejected"
    }</>`));
    expect(codes).toContain(ACTION);
  });
});

describe("fix round 1 — the handler in EXPRESSION position (F1 / F2)", () => {
  const exprPage = (body) => fnPage(body).replace("function login(p) {", `function decide(v) { return v ? "LOGGED IN" : "rejected" }
    function login(p) {`);
  for (const [pn, body] of [
    ["ternary operand", `const v = (local(p) !{ _ :> isOk(p) }) ? true : false
        return v ? "LOGGED IN" : "rejected"`],
    ["call argument", `return decide(local(p) !{ _ :> isOk(p) })`],
    ["if condition", `if (local(p) !{ _ :> allowed(p) }) { return "LOGGED IN" }
        return "rejected"`],
    ["array literal", `const o = [local(p) !{ _ :> isOk(p) }]
        return o[0] ? "LOGGED IN" : "rejected"`],
    ["block arm ending in lift (F2)", `return decide(local(p) !{ _ :> { const got = isOk(p)
            lift got } })`],
    ["block arm `{ lift isOk(p) }` (F2)", `return decide(local(p) !{ _ :> { lift isOk(p) } })`],
  ]) {
    test(`a SYNC outer callee, ${pn}: login is coloured async and the arm awaited`, () => {
      const { js, codes } = compile(exprPage(body));
      expect(codes).toEqual([]);
      const body2 = loginOf(js);
      expect(body2).not.toBe("");
      expect(body2).toMatch(/\(await \(async \(\) => \{/);
      expect(body2).toMatch(/await _scrml_(fetch_isOk|allowed)_\d+\(p\)/);
    });
  }

  test("beside an awaited const: the guard is not batched into Promise.all", () => {
    const { js, codes } = compile(exprPage(`const z = isOk("q")
        const v = (local(p) !{ _ :> isOk(p) }) ? true : false
        return v ? "LOGGED IN" : "rejected"`));
    expect(codes).toEqual([]);
    const body = loginOf(js);
    expect(body).not.toMatch(/Promise\.all/);
    expect(body).toMatch(/await _scrml_fetch_isOk_\d+\(p\)/);
  });
});

describe("fix round 1 — F3: only a value-position TAIL `lift` yields", () => {
  test("a lift nested in an `if` beside the tail lift stays refused", () => {
    const { js, codes } = compile(fnPage(`const v = local(p) !{ _ :> {
            if (p == "x") {
                lift true
            }
            lift false
        } }
        return v ? "LOGGED IN" : "rejected"`));
    expect(codes.length).toBeGreaterThan(0);
    expect(js).not.toMatch(/_scrml_lift\(/);
  });
  test("a lift in a STATEMENT-position block arm (an async arm) stays refused", () => {
    const { js, codes } = compile(fnPage(`let okv = true
        local(p) !{ _ :> { okv = isOk(p)
            lift "x" } }
        return okv ? "LOGGED IN" : "rejected"`));
    expect(codes.length).toBeGreaterThan(0);
    expect(js).not.toMatch(/_scrml_lift\(/);
  });
});

describe("fix round 2 — R2: a comment in an arm is trivia, never code", () => {
  test("parseGuardArmsFromRaw drops `//` and `/* */` comments with their text and keeps line breaks", async () => {
    const { parseGuardArmsFromRaw } = await import("../../src/ast-builder.js");
    const arms = parseGuardArmsFromRaw("!{ _ :> {\n // grant()\n /* grant() */ const g = 1\n lift g\n} }", "x.scrml");
    expect(arms).not.toBeNull();
    expect(arms[0].handler).not.toMatch(/grant/);
    expect(arms[0].handler).toMatch(/const g = 1\nlift g/);
  });
  for (const [pn, body] of [
    ["statement guard", `const v = local(p) !{ _ :> {
            // grant()
            const no = false
            lift no
        } }
        return v ? "LOGGED IN" : "rejected"`],
    ["expression guard, tail expression", `const v = (local(p) !{ _ :> {
            // grant()
            false
        } }) == true
        return v ? "LOGGED IN" : "rejected"`],
  ]) {
    test(`${pn}: a commented-out call is not emitted`, () => {
      const { js } = compile(fnPage(body).replace("function login(p) {", `function grant() { return 1 }
    function login(p) {`));
      expect(js).toMatch(/function _scrml_grant_\d+\(\) \{/);
      // a CALL of it (the declaration aside) would be the comment's text run as code
      expect(js).not.toMatch(/_scrml_grant_\d+\(\)(?!\s*\{)/);
    });
  }
});

describe("fix round 2 — R1: library mode reads an expression-position guard's arms", () => {
  const lib = (arm) => `import { hmac } from "scrml:crypto"
\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function isOk(p) {
        const h = hmac("k", p)
        return p == "secret" && h != ""
    }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    export function login(p) {
        return (local(p) !{ _ :> ${arm} }) ? "LOGGED IN" : "rejected"
    }
}
`;
  for (const [n, arm] of [
    ["a called lambda in a block arm", `{
            const f = (x) => isOk(x)
            lift f(p)
        }`],
    ["an IIFE", `((x) => isOk(x))(p)`],
    ["a local alias then call", `{
            const f = isOk
            lift f(p)
        }`],
  ]) {
    test(`${n} is refused`, () => {
      const { codes } = compile(lib(arm), "library");
      expect(codes.some((c) => /^E-ASYNC-/.test(c))).toBe(true);
    });
  }
});

describe("fix round 2 — R3: a sync-only expression guard is still batched", () => {
  test("a guard whose arms wait on nothing does not end a Promise.all batch", () => {
    const { js, codes } = compile(fnPage(`const a = isOk(p)
        const b = (local(p) !{ _ :> false }) == true
        const c = isOk("z")
        return a && b && c ? "LOGGED IN" : "rejected"`));
    expect(codes).toEqual([]);
    expect(loginOf(js)).toMatch(/Promise\.all/);
  });
});

describe("--mode library: the arm is awaited (server-boundary lowering)", () => {
  test("a nested handler and a helper in an arm", () => {
    const { js, codes } = compile(`import { hmac } from "scrml:crypto"
\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function check(p)! -> AuthErr {
        const h = hmac("k", p)
        if (p != "secret" || h == "") fail AuthErr::Denied("bad")
        return true
    }
    function isOk(p) {
        const h = hmac("k", p)
        return p == "secret" && h != ""
    }
    export function login(p) {
        const v = check(p) !{ _ :> check(p) !{ _ :> isOk(p) } }
        return v ? "LOGGED IN" : "rejected"
    }
}
`, "library");
    expect(codes).toEqual([]);
    expect(js).toMatch(/await check\(p\)/);
    expect(js).toMatch(/await isOk\(p\)/);
  });
});
