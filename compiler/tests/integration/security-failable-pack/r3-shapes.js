// S469 s469-server-return-match-await round 3 (review of b3712d7b3) — ONE shape list, emitted for every
// side (browser server `s6`, fullstack `f3`, library `l1`, tool `t1`), so the payload shape a `fail`
// writes and the binders that read it are judged in EVERY emission mode, by running the emitted code
// with a wrong and a right input. Each shape is a deny-list on the BOUND payload: a binder that reads
// the wrong field (or the whole `.data`) logs the wrong password in.
//
// Data, not logic: `shapesFor(side)` returns [name, scrml source] pairs. Do not edit a shape to make
// it pass.

const DECL = `type AuthErr:enum = { Denied(reason: string), Gone }
type AuthErr2:enum = { Denied2(reason: string, code: number), Gone2 }
type AE = AuthErr`;

// body: the statements of login(p); fns: the failable helpers (failable functions of the shape).
const CHECK = (srv) => `${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
const CHECK2 = (srv) => `${srv}function check2(p)! -> AuthErr2 {
        if (p != "secret") fail AuthErr2::Denied2("bad", 401)
        return true
    }`;
const CHECK_ALIAS = (srv) => `${srv}function checkA(p)! -> AE {
        if (p != "secret") fail AE::Denied("bad")
        return true
    }`;
const CHECK_GENERIC = (srv) => `${srv}function checkG(p)! {
        if (p != "secret") fail .Generic("bad")
        return true
    }`;

const BODIES = [
  ["!{} positional", `const v = check(p) !{ .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
        return v == true ? "LOGGED IN" : v`],
  ["return match positional", `return match check(p) { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`],
  ["return match named", `return match check(p) { .Denied(reason: x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`],
  ["!{} short form", `const v = check(p) !{
            Denied :> e == "bad" ? "rejected" : "LOGGED IN"
            Gone :> "rejected"
        }
        return v == true ? "LOGGED IN" : v`],
  ["!{} multi-field positional", `const v = check2(p) !{ .Denied2(r, c) :> r == "bad" && c == 401 ? "rejected" : "LOGGED IN", .Gone2 :> "rejected" }
        return v == true ? "LOGGED IN" : v`],
  ["return match multi-field named", `return match check2(p) { .Denied2(code: c) :> c == 401 ? "rejected" : "LOGGED IN", .Gone2 :> "rejected", else :> "LOGGED IN" }`],
  ["!{} alias error type", `const v = checkA(p) !{ .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
        return v == true ? "LOGGED IN" : v`],
  ["!{} bare-! Generic", `const v = checkG(p) !{ .Generic(m) :> m == "bad" ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`],
  ["? across two enums, same variant name, different fields", `return match wrap(p) { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`,
    (srv) => `type Other:enum = { Denied(note: string), Gone }
    ${srv}function wrap(p)! -> Other {
        const ok = check(p)?
        return ok
    }`],
];

const FNS = (srv) => [CHECK(srv), CHECK2(srv), CHECK_ALIAS(srv), CHECK_GENERIC(srv)].join("\n    ");

function page(side, body, extraFn) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const extra = extraFn ? extraFn(srv) : "";
  const fns = FNS(srv);
  if (side === "library") {
    return `\${
    export ${DECL.split("\n").join("\n    export ")}
    ${fns}
    ${extra}
    export function login(p) {
        ${body}
    }
}
`;
  }
  if (side === "tool") {
    return `<program kind="tool">
\${
    ${DECL.split("\n").join("\n    ")}
    ${fns}
    ${extra}
    function login(p) {
        ${body}
    }
    function main(args) {
        log(login(args[0]))
    }
}
</program>
`;
  }
  if (side === "server") {
    return `${DECL}
<msg> = "init"
\${
    ${fns}
    ${extra}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
  }
  // fullstack
  return `${DECL}
<msg> = "init"
\${
    ${fns}
    ${extra}
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

// F2 — a server call inside a template literal in a match arm value (server-side and client-side only).
const TEMPLATE = [
  ["template literal in a match arm, reassignment", `const s: string = p
        let v = ""
        v = match s { "" :> "rejected", else :> \`\${isOk(p)}\` == "false" ? "rejected" : "LOGGED IN" }
        return v`],
  ["template literal in a match arm, call argument", `const s: string = p
        return String(match s { "" :> "rejected", else :> \`\${isOk(p)}\` == "false" ? "rejected" : "LOGGED IN" })`],
  ["template literal in a match arm, return", `const s: string = p
        return match s { "" :> "rejected", else :> \`\${isOk(p)}\` == "false" ? "rejected" : "LOGGED IN" }`],
];

export function shapesFor(side) {
  const out = BODIES.map(([n, b, e]) => [n, page(side, b, e)]);
  if (side === "server" || side === "fullstack") {
    for (const [n, b] of TEMPLATE) out.push([n, page(side, b, (srv) => `${srv}function isOk(p) { return p == "secret" }`)]);
  }
  return out;
}
