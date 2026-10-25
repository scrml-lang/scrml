// S470 s470-whole-error-binder-escapes (gap g-impl1-whole-error-binder-allowlist-escapes-s469) — the
// S469 final review's round-6 probes (r6a / r6b) plus this lane's r7, on every side (server `s11`,
// fullstack `f8`, library `l6`, tool `t6`). The whole-error binder `_ e :>` allow-list followed `e`
// into callees and constructors; three escapes logged a wrong password in:
//   1. a callee resolved by NAME (file-wide), not by the binding the call names: a shadowing const /
//      let / parameter / arm-local / callee-local / import / top-level const `check` was trusted as the
//      audited `function check(x: AuthErr)`;
//   2. `log` inherited from the call site into an audited callee (`log` parameter / local there);
//   3. a whole `e` into a variant constructor, its payload read back out (`Box.Wrap(e).data.inner…`,
//      `match b { .Wrap(i) :> i.reason … }`, `i == "bad"`) — OPEN after S470 (KNOWN_FAIL; the fallback
//      refusal newly-rejects examples/09-error-handling.scrml, so it is a PA decision);
// and the adjacent shape: a `match e` arm binding an enum-holding payload (`.Wrapped(i) :> i.reason`).
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const ENUM = `type AuthErr:enum = { Denied(reason: string), Gone }`;
const ENUM2 = `type Inner:enum = { Bad(reason: string), Ok2 }
    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: Inner), Gone }`;

function cases(srv) {
  const W = (more = "", en = ENUM, failv = `AuthErr::Denied("bad")`) => `${en}
    type Box:enum = { Wrap(inner: AuthErr), Empty }
    ${srv}function check(x: AuthErr) { return x is .Denied }
    ${more}
    ${srv}function wrap(p)! -> AuthErr {
        if (p != "secret") fail ${failv}
        return true
    }`;
  const W2 = (more = "", failv = `AuthErr::Wrapped(Inner::Bad("bad"))`) => W(more, ENUM2, failv);
  const X = (cond, pre = "") => `${pre}\n        const v = wrap(p) !{ _ e :> ${cond} ? "rejected" : "LOGGED IN" }\n        return v == true ? "LOGGED IN" : v`;
  const B = (blk, pre = "") => `${pre}\n        let o = "LOGGED IN"\n        const v = wrap(p) !{ _ e :> {\n            ${blk}\n        } }\n        return v == true ? "LOGGED IN" : o`;
  const WRAP = `${srv}function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
  const LIB = { "h.scrml": `\${\n    export ${srv}function check(x) { return x.reason == "bad" }\n    export const log = (x) => x.reason == "bad"\n}\n` };
  const out = [
    // escape 1 — the callee by name
    ["1 shadow const arrow in login", W(), X(`check(e)`, `const check = (x) => x.reason == "bad"`)],
    ["1 shadow let fn in login", W(), X(`check(e)`, `let check = function(x) { return x.reason == "bad" }`)],
    ["1 shadow nested param", W(), `function inner(check) { return wrap(p) !{ _ e :> check(e) ? "rejected" : "LOGGED IN" } }\n        const v = inner((x) => x.reason == "bad")\n        return v == true ? "LOGGED IN" : v`],
    ["1 shadow arm-local const", W(), B(`const check = (x) => x.reason == "bad"\n            if (check(e)) { o = "rejected" }`)],
    ["1 shadow arm-local fn", W(), B(`function check(x) { return x.reason == "bad" }\n            if (check(e)) { o = "rejected" }`)],
    ["1 fn shadowed in fn by const", W(`${srv}function g2(x: AuthErr) { return x is .Denied }\n    ${srv}function f2(x: AuthErr) { const g2 = (y) => y.reason == "bad"\n return g2(x) }`), X(`f2(e)`)],
    ["1 import check + nested local check", `${ENUM}\n    ${WRAP}\n    function outer() { function check(x: AuthErr) { return x is .Denied }\n return 1 }`, X(`check(e)`), `import { check } from "./h.scrml"`, LIB],
    ["1 top-level const check + nested fn check", `${ENUM}\n    ${WRAP}\n    const check = (x) => x.reason == "bad"\n    function outer() { function check(x: AuthErr) { return x is .Denied }\n return 1 }`, X(`check(e)`)],
    ["1 fn shadowed by a param of the callee", `${ENUM}\n    ${WRAP}\n    ${srv}function g(x: AuthErr) { return x is .Denied }\n    ${srv}function f(x: AuthErr, g) { return g(x) }`, X(`f(e, (y) => y.reason == "bad")`)],
    ["1 shadow const declared later in login", W(), X(`check(e)`) + `\n        const check = (y) => y.reason == "bad"`],
    // escape 2 — `log` inherited
    ["2 fn body log param", W(`${srv}function chk2(x: AuthErr, log) { return log(x) }`), X(`chk2(e, (y) => y.reason == "bad")`)],
    ["2 fn body local log", W(`${srv}function chk3(x: AuthErr) { const log = (y) => y.reason == "bad"\n return log(x) }`), X(`chk3(e)`)],
    ["2 fn body local fn log", W(`${srv}function chk4(x: AuthErr) { function log(y) { return y.reason == "bad" }\n return log(x) }`), X(`chk4(e)`)],
    ["2 login-local log arrow", W(), X(`log(e)`, `const log = (y) => y.reason == "bad"`)],
    ["2 arm-local log", W(), B(`const log = (y) => y.reason == "bad"\n            if (log(e)) { o = "rejected" }`)],
    ["2 import const log", `${ENUM}\n    ${WRAP}`, X(`log(e)`), `import { log } from "./h.scrml"`, LIB],
    // escape 3 — a whole `e` into a constructor
    ["3 ctor extract match", W(), B(`const b = Box.Wrap(e)\n            match b { .Wrap(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`)],
    ["3 ctor extract dot ctor", W(), B(`const b = .Wrap(e)\n            match b { .Wrap(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`)],
    ["3 ctor inline member", W(), X(`Box.Wrap(e).inner.reason == "bad"`)],
    ["3 ctor data member", W(), X(`Box.Wrap(e).data.inner.reason == "bad"`)],
    ["3 ctor extract match eq", W(), B(`const b = Box.Wrap(e)\n            match b { .Wrap(i) :> { if (i == "bad") { o = "rejected" } } else :> { } }`)],
    ["3 ctor local alias data", W(), B(`const b = Box.Wrap(e)\n            if (b.data.inner.reason == "bad") { o = "rejected" }`)],
    ["3 ctor via typed fn", W(`${srv}function wr(x: AuthErr) { return Box.Wrap(x) }`), X(`wr(e).data.inner.reason == "bad"`)],
    // adjacent — a `match e` arm binding an enum-holding payload
    ["4 nested enum payload member", W2(), B(`match e { .Wrapped(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }`)],
    ["4 nested enum payload eq", W2(), B(`match e { .Wrapped(i) :> { if (i == "bad") { o = "rejected" } } else :> { } }`)],
    // S470 fix round 1 (review of d015e3e34): an audited callee's parameter defaults; a top-level
    // const beside the audited function; a `!{}` in a function written as a value; a bound position
    ["5 D1 default param reads x.reason", W(`${srv}function f(x: AuthErr, r = x.reason) { return r == "bad" }`), X(`f(e)`)],
    ["5 D2 default param aliases x", W(`${srv}function f(x: AuthErr, y = x) { return y.reason == "bad" }`), X(`f(e)`)],
    ["5 D4 default on the error param", W(`${srv}function f(x: AuthErr = AuthErr::Gone, r = x.reason) { return r == "bad" }`), X(`f(e)`)],
    ["5 D6 default param closure", W(`${srv}function f(x: AuthErr, h = () => x.reason) { return h() == "bad" }`), X(`f(e)`)],
    ["5 R3 top const beside fn", W(`const check = (y) => y.reason == "bad"`), X(`check(e)`)],
    ["5 F1 fn-expr direct e.reason", W(), `const inner = function() { return wrap(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" } }\n        const v = inner()\n        return v == true ? "LOGGED IN" : v`],
    ["5 F2 block arrow direct e.reason", W(), `const inner = () => { return wrap(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" } }\n        const v = inner()\n        return v == true ? "LOGGED IN" : v`],
    ["VALID Q1 primitive sibling of enum field", W("", `type Inner:enum = { Bad(reason: string), Ok2 }\n    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: Inner, code: number), Gone }`, `AuthErr::Wrapped(Inner::Bad("bad"), 1)`), B(`match e { .Wrapped(_, c) :> { if (c == 1) { o = "rejected" } } else :> { } }`)],
    // valid controls (the allowed uses still compile and deny)
    ["VALID check(e)", W(), X(`check(e)`)],
    ["VALID log(e)", W(), B(`log(e)\n            o = "rejected"`)],
    ["VALID nested audited fn", W(), X(`near(e)`, `function near(x: AuthErr) { return x is .Denied }`)],
    ["VALID chain f->g", W(`${srv}function g1(x: AuthErr) { return x is .Denied }\n    ${srv}function f1(x: AuthErr) { return g1(x) }`), X(`f1(e)`)],
    ["VALID primitive payload of match e", W(), X(`(match e { .Denied(r) :> r == "bad", else :> true })`)],
    // the SPEC §18.6.1 idiom (a whole error into a constructor) — still compiles: escape 3 is open
    ["VALID ctor match", W(), B(`const b = Box.Wrap(e)\n            match b { .Wrap(i) :> { o = "rejected" } else :> { } }`)],
    // a valid program impl#1 now refuses (S470 impl#1 limitation; pinned PASS-REFUSED)
    ["REFUSED-VALID nested enum match", W2(), B(`match e { .Wrapped(i) :> { match i { .Bad(r) :> { if (r == "bad") { o = "rejected" } } else :> { } } } else :> { } }`)],
  ];
  return out;
}

function page(side, d, body, imports = "") {
  if (side === "library") return `${imports}
\${
    ${d}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
${imports}
\${
    ${d}
    function login(p) {
        ${body}
    }
    function main(args) {
        log(login(args[0]))
    }
}
</program>
`;
  if (side === "server") return `${imports}
<msg> = "init"
\${
    ${d}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
  return `${imports}
<msg> = "init"
\${
    ${d}
    function login(p) {
        ${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
}

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  return cases(srv).map(([n, d, b, imp, extra]) => [n, page(side, d, b, imp ?? ""), extra ?? undefined]);
}
