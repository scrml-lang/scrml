// S469 s469-server-return-match-await round 5 — the whole-error binder `_ e :>` (SPEC §18.6.1; ruling
// user-voice-scrml.md S469 "SPEC: whole error + refuse (Recommended)"), on every side (server `s8`,
// fullstack `f5`, library `l3`, tool `t3`). `e` is the WHOLE error value (variant + payload, typed as
// the call's error enum): matching on it and passing it on are valid; reading a payload field off it
// or comparing it with a primitive is refused (E-TYPE-004 / E-EQ-001). Each shape is a deny-list.
//
// Data, not logic: `shapesFor(side)` returns [name, scrml source]. Do not edit a shape to make it pass.

const DECL = (srv) => `type AuthErr:enum = { Denied(reason: string), Gone }
    ${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    ${srv}function checkG(p)! {
        if (p != "secret") fail .Generic("bad")
        return true
    }
    ${srv}function verdictOf(e: AuthErr) {
        return match e { .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
    }`;

const CASES = [
  // valid
  // (`verdictOf` matches it: `match e { .Denied(r) :> … }`. A `match` written inline as the arm value
  // is refused on every tree, a separate arm-grammar limit.)
  ["whole binder, passed on whole (matched in the callee)", `const v = check(p) !{ _ e :> verdictOf(e) }
        return v == true ? "LOGGED IN" : v`],
  ["whole binder, held in a local then passed on", `const v = check(p) !{ _ e :> {
            const held = e
            verdictOf(held)
        } }
        return v == true ? "LOGGED IN" : v`],
  // refused
  ["whole binder, payload field read", `const v = check(p) !{ _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`],
  ["whole binder, compared with a primitive (Generic)", `const v = checkG(p) !{ _ e :> e == "bad" ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`],
  ["whole binder, != a primitive", `const v = check(p) !{ _ e :> e != "bad" ? "LOGGED IN" : "rejected" }
        return v == true ? "LOGGED IN" : v`],
  ["whole binder, payload field in a template", `const v = check(p) !{ _ e :> \`\${e.reason}\` == "bad" ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`],
  ["whole binder, payload field in a block arm", `const v = check(p) !{ _ e :> {
            const m = e.reason
            m == "bad" ? "rejected" : "LOGGED IN"
        } }
        return v == true ? "LOGGED IN" : v`],
];

function page(side, body) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const decls = DECL(srv);
  if (side === "library") return `\${
    export ${decls.replace(/^type /, "type ")}
    export function login(p) {
        ${body}
    }
}
`.replace("export type AuthErr", "export type AuthErr");
  if (side === "tool") return `<program kind="tool">
\${
    ${decls}
    function login(p) {
        ${body}
    }
    function main(args) {
        log(login(args[0]))
    }
}
</program>
`;
  if (side === "server") return `<msg> = "init"
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
  return `<msg> = "init"
\${
    ${decls}
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
  return CASES.map(([n, b]) => [n, page(side, b)]);
}
