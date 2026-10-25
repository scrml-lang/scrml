/**
 * whole-error-binder-escapes-s470.test.js — S470 s470-whole-error-binder-escapes
 * (gap g-impl1-whole-error-binder-allowlist-escapes-s469). Executed floor: security-failable-pack
 * r8-shapes.js (families s11 / f8 / l6 / t6).
 *
 * SPEC §18.6.1: `_ e :>` binds the WHOLE error value. The allow-list that follows `e` had three
 * escapes, each a wrong password that logged in:
 *  1. a callee resolved by NAME (file-wide), not by the binding the call names — a shadowing local,
 *     parameter, import or arm-local `check` was trusted as the audited top-level `check`;
 *  2. `log` inherited from the call site into an audited callee (a `log` parameter / local there);
 *  3. a whole `e` into a variant constructor, whose payload came back out unchecked — NOT fixed in
 *     S470 (blocked on a PA decision; see the escape-3 block below);
 * plus the adjacent shape found here: a `match e` arm binding an enum-holding payload (`.Wrapped(i)`)
 * lets that enum value be misread the same way — refused (impl#1 limitation, fail closed).
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

function codesOfFiles(files) {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s470-web-${uniq}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, src] of Object.entries(files)) writeFileSync(resolve(dir, name), src);
  try {
    const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: resolve(dir, "out"), log: () => {} });
    return (result.errors ?? [])
      .filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""))
      .map((e) => e.code);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const page = (decls, body, imports = "") => `${imports}
<msg> = "init"
\${
    ${decls}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;

const ENUM = `type Inner:enum = { Bad(reason: string), Ok2 }
    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: Inner), Gone }
    type Box:enum = { Wrap(inner: AuthErr), Empty }`;
const W = (more = "") => `${ENUM}
    server function check(x: AuthErr) { return x is .Denied }
    ${more}
    server function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
const X = (cond, pre = "") => `${pre}
        const v = wrap(p) !{ _ e :> ${cond} ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`;
const B = (blk, pre = "") => `${pre}
        let o = "LOGGED IN"
        const v = wrap(p) !{ _ e :> {
            ${blk}
        } }
        return v == true ? "LOGGED IN" : o`;
const codesOf = (decls, body, imports = "", extra = {}) => codesOfFiles({ "app.scrml": page(decls, body, imports), ...extra });

describe("escape 1 — the callee is the binding the call names (lexical), never a file-wide name", () => {
  const REFUSED = [
    ["shadowed by a const arrow in the enclosing function", W(), X(`check(e)`, `const check = (x) => x.reason == "bad"`)],
    ["shadowed by a let function expression", W(), X(`check(e)`, `let check = function(x) { return x.reason == "bad" }`)],
    ["shadowed by a parameter of a nested function", W(), `function inner(check) { return wrap(p) !{ _ e :> check(e) ? "rejected" : "LOGGED IN" } }
        const v = inner((x) => x.reason == "bad")
        return v == true ? "LOGGED IN" : v`],
    ["shadowed by an arm-local const", W(), B(`const check = (x) => x.reason == "bad"\n            if (check(e)) { o = "rejected" }`)],
    ["shadowed by an arm-local function", W(), B(`function check(x) { return x.reason == "bad" }\n            if (check(e)) { o = "rejected" }`)],
    ["shadowed by a const inside an audited callee", W(`server function g2(x: AuthErr) { return x is .Denied }
    server function f2(x: AuthErr) { const g2 = (y) => y.reason == "bad"
 return g2(x) }`), X(`f2(e)`)],
    ["shadowed by a parameter of an audited callee", W(`server function g(x: AuthErr) { return x is .Denied }
    server function f(x: AuthErr, g) { return g(x) }`), X(`f(e, (y) => y.reason == "bad")`)],
    ["a top-level const of the name, a nested function of it elsewhere", `${ENUM}
    server function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    const check = (x) => x.reason == "bad"
    function outer() { function check(x: AuthErr) { return x is .Denied }
 return 1 }`, X(`check(e)`)],
    ["a shadowing const declared later in the enclosing function", W(), X(`check(e)`) + `
        const check = (y) => y.reason == "bad"`],
  ];
  for (const [n, decls, body] of REFUSED) {
    test(`${n} → E-TYPE-031`, () => {
      expect(codesOf(decls, body)).toContain("E-TYPE-031");
    });
  }
  test("an imported `check` is not a same-named nested local function", () => {
    const lib = { "h.scrml": `\${\n    export server function check(x) { return x.reason == "bad" }\n}\n` };
    const decls = `${ENUM}
    server function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function outer() { function check(x: AuthErr) { return x is .Denied }
 return 1 }`;
    expect(codesOf(decls, X(`check(e)`), `import { check } from "./h.scrml"`, lib)).toContain("E-TYPE-031");
  });
  test("ALLOWED: the top-level audited function the call names", () => {
    expect(codesOf(W(), X(`check(e)`))).toEqual([]);
  });
  test("ALLOWED: a nested audited function declared in the enclosing function", () => {
    expect(codesOf(W(), X(`near(e)`, `function near(x: AuthErr) { return x is .Denied }`))).toEqual([]);
  });
  test("ALLOWED: a hoisted function declared later in the enclosing function", () => {
    expect(codesOf(W(), X(`check2(e)`) + `
        function check2(x: AuthErr) { return x is .Denied }`)).toEqual([]);
  });
  test("ALLOWED: an audited chain f -> g through top-level functions", () => {
    expect(codesOf(W(`server function g1(x: AuthErr) { return x is .Denied }
    server function f1(x: AuthErr) { return g1(x) }`), X(`f1(e)`))).toEqual([]);
  });
});

describe("escape 2 — `log` is the builtin only where THAT body has no `log` binding", () => {
  const REFUSED = [
    ["a `log` parameter of the audited callee", W(`server function chk2(x: AuthErr, log) { return log(x) }`), X(`chk2(e, (y) => y.reason == "bad")`)],
    ["a local `log` const in the audited callee", W(`server function chk3(x: AuthErr) { const log = (y) => y.reason == "bad"
 return log(x) }`), X(`chk3(e)`)],
    ["a local `log` function in the audited callee", W(`server function chk4(x: AuthErr) { function log(y) { return y.reason == "bad" }
 return log(x) }`), X(`chk4(e)`)],
    ["a `log` declared later at the top level", W(), X(`log(e)`) + `
    }
    const log = (y) => y.reason == "bad"
    server function unused() {`],
  ];
  for (const [n, decls, body] of REFUSED) {
    test(`${n} → E-TYPE-031`, () => {
      expect(codesOf(decls, body)).toContain("E-TYPE-031");
    });
  }
  test("ALLOWED: the builtin `log(e)`", () => {
    expect(codesOf(W(), B(`log(e)\n            o = "rejected"`))).toEqual([]);
  });
  test("ALLOWED: the builtin `log(x)` inside an audited callee", () => {
    expect(codesOf(W(`server function chk5(x: AuthErr) { log(x)
 return x is .Denied }`), X(`chk5(e)`))).toEqual([]);
  });
});

describe("escape 3 — a whole `e` into a variant constructor (OPEN: blocked on a PA decision)", () => {
  // Neither fix lands in S470. The preferred rule (refuse a payload read on any enum-typed value,
  // from the value's type) is not decidable on impl#1's path: a constructor call, a `const` bound to
  // it, and a match payload binder carry no type. The fallback (refuse a whole `e` into a
  // constructor) newly-rejects examples/09-error-handling.scrml and SPEC §18.6.1's own
  // `@state = .Failed(err)`. The security pack carries these shapes as KNOWN_FAIL (r8-shapes.js "3 …").
  test.todo("inline member off the constructed value (`Box.Wrap(e).data.inner.reason`)");
  test.todo("constructed then matched (`match b { .Wrap(i) :> i.reason … }`)");
  test.todo("constructed then compared (`.Wrap(i) :> i == \"bad\"`)");
  test.todo("constructed then member read through a local (`b.data.inner.reason`)");
  test.todo("constructed inside an audited callee (`function wr(x: AuthErr) { return Box.Wrap(x) }`)");
  test("still ALLOWED (the SPEC §18.6.1 idiom): a whole error into a constructor whose field is the enum", () => {
    expect(codesOf(W(), B(`const b = Box.Wrap(e)\n            o = "rejected"`))).toEqual([]);
  });
});

describe("adjacent — a `match e` arm binding an enum-holding payload is refused (impl#1 limitation)", () => {
  test("member read off the nested enum binder → E-TYPE-031", () => {
    expect(codesOf(W(), B(`match e { .Wrapped(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`))).toContain("E-TYPE-031");
  });
  test("comparison of the nested enum binder (expression match) → E-TYPE-031", () => {
    expect(codesOf(W(), X(`(match e { .Wrapped(i) :> i == "bad", else :> false })`))).toContain("E-TYPE-031");
  });
  test("ALLOWED: a primitive payload binder of `match e`", () => {
    expect(codesOf(W(), X(`(match e { .Denied(r) :> r == "bad", else :> true })`))).toEqual([]);
  });
});

// S470 fix round 1 — the review of d015e3e34.
const ENUM3 = `type Inner:enum = { Bad(reason: string), Ok2 }
    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: Inner, code: number), Gone }`;
const W3 = (more = "") => `${ENUM3}
    ${more}
    server function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Wrapped(Inner::Bad("bad"), 1)
        return true
    }`;

describe("fix round 1 #1 — an audited callee's parameter DEFAULTS are audited", () => {
  const REFUSED = [
    ["D1 a default reads x.reason", `server function f(x: AuthErr, r = x.reason) { return r == "bad" }`, "E-TYPE-004"],
    ["D2 a default aliases x", `server function f(x: AuthErr, y = x) { return y.reason == "bad" }`, "E-TYPE-031"],
    ["D4 a default on the error parameter, another reads it", `server function f(x: AuthErr = AuthErr::Gone, r = x.reason) { return r == "bad" }`, "E-TYPE-004"],
    ["D6 a default closure reads x.reason", `server function f(x: AuthErr, h = () => x.reason) { return h() == "bad" }`, "E-TYPE-004"],
  ];
  for (const [n, fn, code] of REFUSED) {
    test(`${n} → ${code}`, () => {
      expect(codesOf(W(fn), X(`f(e)`))).toContain(code);
    });
  }
  test("ALLOWED by the audit: a default passing x to an audited function", () => {
    // (A server-function default that calls a server function is E-PARAM-DEFAULT-AWAIT, unrelated.)
    const codes = codesOf(W(`server function g(y: AuthErr) { return y is .Denied }
    server function f(x: AuthErr, r = g(x)) { return r }`), X(`f(e)`));
    expect(codes.filter((c) => c === "E-TYPE-031" || c === "E-TYPE-004")).toEqual([]);
  });
});

describe("fix round 1 #2 — a top-level name declared twice is not one function declaration", () => {
  test("R3 a top-level const beside the audited function → E-TYPE-031", () => {
    expect(codesOf(W(`const check = (y) => y.reason == "bad"`), X(`check(e)`))).toContain("E-TYPE-031");
  });
});

describe("fix round 1 #3 — a `!{}` inside a function written as a value is audited", () => {
  test("F1 a function expression, direct e.reason → E-TYPE-004", () => {
    expect(codesOf(W(), `const inner = function() { return wrap(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" } }
        const v = inner()
        return v == true ? "LOGGED IN" : v`)).toContain("E-TYPE-004");
  });
  test("F2 a block-bodied arrow, direct e.reason → E-TYPE-004", () => {
    expect(codesOf(W(), `const inner = () => { return wrap(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" } }
        const v = inner()
        return v == true ? "LOGGED IN" : v`)).toContain("E-TYPE-004");
  });
  test("a parameter of the function expression shadows the audited `check` → E-TYPE-031", () => {
    expect(codesOf(W(), `const inner = (check) => { return wrap(p) !{ _ e :> check(e) ? "rejected" : "LOGGED IN" } }
        const v = inner((x) => x.reason == "bad")
        return v == true ? "LOGGED IN" : v`)).toContain("E-TYPE-031");
  });
});

describe("fix round 1 #4 — only the BOUND payload positions are checked", () => {
  test("Q1 `.Wrapped(_, c)` binds only the primitive field → allowed", () => {
    expect(codesOf(W3(), B(`match e { .Wrapped(_, c) :> { if (c == 1) { o = "rejected" } } else :> { } }`))).toEqual([]);
  });
  test("a named form binding the enum field (`code: _, inner: i`) → E-TYPE-031", () => {
    expect(codesOf(W3(), B(`match e { .Wrapped(code: _, inner: i) :> { log(i) } else :> { } }`))).toContain("E-TYPE-031");
  });
  test("a positional binder of the enum field → E-TYPE-031", () => {
    expect(codesOf(W3(), B(`match e { .Wrapped(i, _) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`))).toContain("E-TYPE-031");
  });
});

describe("fix round 1 #5 — a function declared in an audited callee's body resolves", () => {
  test("P2 a nested typed helper → allowed", () => {
    expect(codesOf(W(`server function f(x: AuthErr) { function g(y: AuthErr) { return y is .Denied }
 return g(x) }`), X(`f(e)`))).toEqual([]);
  });
  test("a nested helper that reads a field → E-TYPE-004", () => {
    expect(codesOf(W(`server function f(x: AuthErr) { function g(y: AuthErr) { return y.reason == "bad" }
 return g(x) }`), X(`f(e)`))).toContain("E-TYPE-004");
  });
});
