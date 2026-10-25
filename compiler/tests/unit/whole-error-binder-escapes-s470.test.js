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
 *  3. a whole `e` into a variant constructor, whose payload came back out unchecked — closed by the
 *     S470 lane-B ruling "(B) Type the binders" (s470-typed-payload-binders; the escape-3 block below);
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

describe("escape 3 — a whole `e` into a variant constructor, its payload read back out (S470 lane B)", () => {
  // Ruling (bryan, S470, user-voice-scrml.md "(B) Type the binders (Recommended)"): a payload binder
  // has its field's declared type (§18.7) and a member read other than `.variant` on an enum value is
  // E-TYPE-004 — so the payload of a constructed value cannot be read back out except by naming the
  // variant. The (A) constructor refusal is NOT landed: `@state = .Failed(err)` stays allowed.
  test("inline member off the constructed value (`Box.Wrap(e).data.inner.reason`) → E-TYPE-004", () => {
    expect(codesOf(W(), X(`Box.Wrap(e).data.inner.reason == "bad"`))).toContain("E-TYPE-004");
  });
  test("constructed then matched (`match b { .Wrap(i) :> i.reason … }`) → E-TYPE-004", () => {
    expect(codesOf(W(), B(`const b = Box.Wrap(e)\n            match b { .Wrap(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`))).toContain("E-TYPE-004");
  });
  test("constructed by a bare `.Wrap(e)` then matched → E-TYPE-004", () => {
    expect(codesOf(W(), B(`const b = .Wrap(e)\n            match b { .Wrap(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`))).toContain("E-TYPE-004");
  });
  test("constructed then compared (`.Wrap(i) :> i == \"bad\"`) → E-EQ-001", () => {
    expect(codesOf(W(), B(`const b = Box.Wrap(e)\n            match b { .Wrap(i) :> { if (i == "bad") { o = "rejected" } } else :> { } }`))).toContain("E-EQ-001");
  });
  test("constructed then member read through a local (`b.data.inner.reason`) → E-TYPE-004", () => {
    expect(codesOf(W(), B(`const b = Box.Wrap(e)\n            if (b.data.inner.reason == "bad") { o = "rejected" }`))).toContain("E-TYPE-004");
  });
  test("constructed inside an audited callee (`function wr(x: AuthErr) { return Box.Wrap(x) }`) → E-TYPE-004", () => {
    expect(codesOf(W(`server function wr(x: AuthErr) { return Box.Wrap(x) }`), X(`wr(e).data.inner.reason == "bad"`))).toContain("E-TYPE-004");
  });
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

// S470 fix round 2 — the review of 43d162d52: ONE audit keyed on the `!{}` node.
const H2 = `wrap(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" }`;
const R2 = (pre) => `${pre}\n        return v == true ? "LOGGED IN" : v`;
describe("fix round 2 #1/#2 — a `!{}` in any expression position or function value is audited", () => {
  const CASES = [
    ["J1 a call argument", W(`function id(a) { return a }`), R2(`const v = id(${H2})`)],
    ["J3 an object literal value", W(), R2(`const o = { a: ${H2} }\n        const v = o.a`)],
    ["J4 a tape literal element", W(), R2(`const t = [${H2}]\n        const v = t[0]`)],
    ["E2 an expression arrow passed as an argument", W(`function apply(f) { return f(1) }`), R2(`const v = apply((q) => ${H2})`)],
    ["E5 an IIFE", W(), R2(`const v = (() => ${H2})()`)],
    ["E10 an arrow as a parameter default", W(`function apply(f = () => wrap("wrong") !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" }) { return f() }`), R2(`const v = apply()`)],
    ["K4 an arrow inside a nested function", W(`function apply(f) { return f() }`), R2(`function f() { return apply(() => ${H2}) }\n        const v = f()`)],
  ];
  for (const [n, d, b] of CASES) {
    test(`${n} → E-TYPE-004`, () => {
      expect(codesOf(d, b)).toContain("E-TYPE-004");
    });
  }
  test("ALLOWED: a valid whole-error use in an expression position", () => {
    expect(codesOf(W(`function id(a) { return a }`), R2(`const v = id(wrap(p) !{ _ e :> e is .Denied ? "rejected" : "LOGGED IN" })`))).toEqual([]);
  });
});

describe("fix round 2 #3 — `arguments` reads the error without naming it", () => {
  const CASES = [
    ["D14 in an audited callee's body", W(`server function f(x: AuthErr) { return arguments[0].reason == "bad" }`), X(`f(e)`)],
    ["D13 in an audited callee's default", W(`server function f(x: AuthErr, r = arguments[0].reason) { return r == "bad" }`), X(`f(e)`)],
    ["AR3 destructured in an audited callee", W(`server function f(x: AuthErr) { const [a] = arguments\n return a.reason == "bad" }`), X(`f(e)`)],
    ["AR6 spread on from an audited callee", W(`server function g(y) { return y.reason == "bad" }\n    server function f(x: AuthErr) { return g(...arguments) }`), X(`f(e)`)],
    ["AR1 in the arm itself", W(), X(`arguments[0].reason == "bad"`)],
  ];
  for (const [n, d, b] of CASES) {
    test(`${n} → E-TYPE-031`, () => {
      expect(codesOf(d, b)).toContain("E-TYPE-031");
    });
  }
});

// S470 fix round 3 — the review of c26134ff4.
describe("fix round 3 #1/#2 — a `!{}` held as TEXT is audited", () => {
  const IN = `wrap(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" }`;
  test("NN1 nested in an expression-position `!{}` arm → E-TYPE-004", () => {
    expect(codesOf(W(`function id(a) { return a }`), R2(`const v = id(wrap(p) !{ _ :> ${IN} })`))).toContain("E-TYPE-004");
  });
  test("NN3 nested in a named arm → E-TYPE-004", () => {
    expect(codesOf(W(`function id(a) { return a }`), R2(`const v = id(wrap(p) !{ .Denied(r) :> ${IN}, _ :> "rejected" })`))).toContain("E-TYPE-004");
  });
  test("P7 nested in a parameter default's arm → E-TYPE-004", () => {
    expect(codesOf(W(`function apply(a = wrap("w") !{ _ :> wrap("w") !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" } }) { return a }`), R2(`const v = apply()`))).toContain("E-TYPE-004");
  });
  test("ALLOWED: a valid nested whole-error use", () => {
    expect(codesOf(W(`function id(a) { return a }`), R2(`const v = id(wrap(p) !{ _ :> wrap(p) !{ _ e :> e is .Denied ? "rejected" : "LOGGED IN" } })`))).toEqual([]);
  });
});

describe("fix round 3 #3 — the handled call's enum is resolved BY BINDING", () => {
  const DECLS = `type Inner:enum = { Bad(reason: string), Ok2 }
    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: string), Gone }
    type BigErr:enum = { Denied(reason: string), Wrapped(inner: Inner), Gone }
    server function w(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("x")
        return true
    }
    server function wrapBig(p)! -> BigErr {
        if (p != "secret") fail BigErr::Wrapped(Inner::Bad("bad"))
        return true
    }`;
  test("N2 a local const shadowing a file-level failable function → E-TYPE-031", () => {
    expect(codesOf(DECLS, R2(`const w = wrapBig\n        const v = w(p) !{ _ e :> (match e { .Wrapped(i) :> i.reason == "bad", else :> true }) ? "rejected" : "LOGGED IN" }`))).toContain("E-TYPE-031");
  });
});

describe("fix round 3 #4 — `arguments` is read from the tree", () => {
  const CASES = [
    ["a string holding the word and a `/`", `"bad arguments / retry"`],
    ["an object key", `({ arguments: 1 }).arguments == 1 ? "r" : "L"`],
    ["a member name", `p.arguments == "x" ? "r" : "L"`],
  ];
  for (const [n, h] of CASES) {
    test(`ALLOWED: ${n}`, () => {
      expect(codesOf(W(), R2(`const v = wrap(p) !{ _ :> ${h} }`)).filter((c) => c === "E-TYPE-031")).toEqual([]);
    });
  }
});

// S470 fix round 4 — the review of eb0d5677a.
const RAWPAGE = (body, logic = "") => `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    type Ph:enum = { A, B(n: number) }
    function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    ${logic}
}
<msg> = "init"
<ph>: Ph = .A
<xs> = [{ id: 1 }]
${body}
<p id="out">\${@msg}</p>
`;
const rawCodes = (src) => codesOfFiles({ "app.scrml": src });
describe("fix round 4 F1 — a `!{}` in a markup `<match>` arm holding an `<each>` is audited", () => {
  const ROW = (arm) => `<match for=Ph on=@ph>\n  <A><ul><each in=@xs key=@.id as x><li><button onclick=\${ @msg = wrap("x") !{ ${arm} } }>b</button></li></each></ul></>\n  <B n>b</>\n</match>`;
  test("in the row → E-TYPE-004", () => {
    expect(rawCodes(RAWPAGE(ROW(`_ e :> e.reason == "bad" ? "rejected" : "LOGGED IN"`)))).toContain("E-TYPE-004");
  });
  test("in a component → E-TYPE-004", () => {
    expect(rawCodes(RAWPAGE(`const Card = <div props={ label: string }>\n  ${ROW(`_ e :> e.reason == "bad" ? "rejected" : "LOGGED IN"`)}\n</>\n<Card label="a"/>`))).toContain("E-TYPE-004");
  });
  test("ALLOWED: a valid whole-error use in the row", () => {
    expect(rawCodes(RAWPAGE(ROW(`_ e :> e is .Denied ? "rejected" : "LOGGED IN"`)))).toEqual([]);
  });
  test("ALLOWED: a `!{` only inside a string in the arm", () => {
    expect(rawCodes(RAWPAGE(`<match for=Ph on=@ph>\n  <A><p>\${"!{"}</p><ul><each in=[1] as x><li>x</li></each></ul></>\n  <B>b</>\n</match>`))).toEqual([]);
  });
});

describe("fix round 4 F3 — a literal `!{` in prose or a string is not a handler", () => {
  test("ALLOWED: <md> prose", () => {
    expect(rawCodes("<md>\nHandle a failure with `!{ _ e :> … }` — see §18.6.1.\n</md>\n")).toEqual([]);
  });
  test("ALLOWED: a struct field's string default", () => {
    expect(rawCodes(`\${\n    type Msg:struct = { text: string, hint: string = "use !{ } to handle errors" }\n    const m: Msg = { text: "a" }\n}\n<p id="out">\${m.hint}</p>\n`)).toEqual([]);
  });
});
