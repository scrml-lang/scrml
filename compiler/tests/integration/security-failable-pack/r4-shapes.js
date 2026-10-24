// S469 s469-server-return-match-await round 4 (review of 048dba21a) — one shape list, emitted for every
// side (server `s7`, fullstack `f4`, library `l2`, tool `t2`), judged by running the emitted code with a
// wrong and a right input. Each shape is a deny-list on the BOUND payload.
//
//   - `?` into an enum whose same-named variant has DIFFERENT fields, through a type ALIAS on the
//     target / on both sides, a CROSS-FILE callee, a callee whose error type is an alias: refused
//     (E-ERROR-010) — the re-raised payload is keyed by the callee's fields and a reader of the
//     enclosing type bound `undefined` (H-A / H-B);
//   - the same names in another ORDER: the same payload (keyed by name) — accepted, and correct;
//   - a TAGGED template with a server call in a match-arm value (client): awaited (H-C);
//   - a short-form arm reading its implicit `e` inside a template, over a variant with no single
//     field, beside an outer `e`: refused, never the outer value (M-1).
//
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const BANG = `const v = wrap(p) !{ .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
        return v == true ? "LOGGED IN" : v`;
// (a named binder is read by the `match` arm grammar; a `!{}` positional binder binds in the
// enclosing enum's own declared order — `reason, code` here)
const BANG2 = `const v = wrap(p) !{ .Denied2(r, c) :> r == "bad" && c == 401 ? "rejected" : "LOGGED IN", .Gone2 :> "rejected" }
        return v == true ? "LOGGED IN" : v`;

const AUTH = (srv) => `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
    export ${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
`;
const AUTH_ALIAS = (srv) => `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
    type AA = AuthErr
    export ${srv}function check(p)! -> AA {
        if (p != "secret") fail AA::Denied("bad")
        return true
    }
}
`;

// [name, decls(srv), body, imports, extra(srv)]
const CASES = [
  ["? into an alias of a different-field enum", (srv) => `type AuthErr:enum = { Denied(reason: string), Gone }
    type Other:enum = { Denied(note: string), Gone }
    type OA = Other
    ${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    ${srv}function wrap(p)! -> OA {
        const ok = check(p)?
        return ok
    }`, BANG],
  ["? alias on both sides, different fields", (srv) => `type AuthErr:enum = { Denied(reason: string), Gone }
    type AA = AuthErr
    type Other:enum = { Denied(note: string), Gone }
    type OA = Other
    ${srv}function check(p)! -> AA {
        if (p != "secret") fail AA::Denied("bad")
        return true
    }
    ${srv}function wrap(p)! -> OA {
        const ok = check(p)?
        return ok
    }`, BANG],
  ["? cross-file callee into a different-field enum", (srv) => `type Other:enum = { Denied(note: string), Gone }
    ${srv}function wrap(p)! -> Other {
        const ok = check(p)?
        return ok
    }`, BANG, `import { check } from "./auth.scrml"`, (srv) => ({ "auth.scrml": AUTH(srv) })],
  ["? cross-file callee alias into a different-field enum", (srv) => `type Other:enum = { Denied(note: string), Gone }
    ${srv}function wrap(p)! -> Other {
        const ok = check(p)?
        return ok
    }`, BANG, `import { check } from "./auth.scrml"`, (srv) => ({ "auth.scrml": AUTH_ALIAS(srv) })],
  ["? same field names in another order (accepted)", (srv) => `type AuthErr2:enum = { Denied2(code: number, reason: string), Gone2 }
    type Other2:enum = { Denied2(reason: string, code: number), Gone2 }
    ${srv}function check(p)! -> AuthErr2 {
        if (p != "secret") fail AuthErr2::Denied2(401, "bad")
        return true
    }
    ${srv}function wrap(p)! -> Other2 {
        const ok = check(p)?
        return ok
    }`, BANG2],
  ["short form reads e in a template, multi-field variant, outer e", (srv) => `type AuthErr2:enum = { Denied2(code: number, reason: string), Gone2 }
    ${srv}function wrap(p)! -> AuthErr2 {
        if (p != "secret") fail AuthErr2::Denied2(401, "bad")
        return true
    }`, `const e = "ok"
        const v = wrap(p) !{
            Denied2 :> \`\${e}\` == "ok" ? "LOGGED IN" : "rejected"
            Gone2 :> "rejected"
        }
        return v == true ? "LOGGED IN" : v`],
  ["short form reads e in a template, unit variant, outer e", (srv) => `type AuthErr:enum = { Denied, Gone }
    ${srv}function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied
        return true
    }`, `const e = "ok"
        const v = wrap(p) !{
            Denied :> \`\${e}\` == "ok" ? "LOGGED IN" : "rejected"
            Gone :> "rejected"
        }
        return v == true ? "LOGGED IN" : v`],
];

// H-C — a tagged template with a server call in a match-arm value (client and server sides).
const TAGGED = [
  ["tagged template in a match arm value, return", `const s: string = p
        return match s { "" :> "rejected", else :> tag\`\${isOk(p)}\` == "false" ? "rejected" : "LOGGED IN" }`],
  ["tagged template in a match arm value, reassignment", `const s: string = p
        let v = ""
        v = match s { "" :> "rejected", else :> tag\`\${isOk(p)}\` == "false" ? "rejected" : "LOGGED IN" }
        return v`],
];
const TAG_FNS = (srv) => `${srv}function isOk(p) { return p == "secret" }
    function tag(strs, x) { return String(x) }`;

function page(side, decls, body, imports = "") {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  if (side === "library") return `${imports}
\${
    ${decls(srv)}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
${imports}
\${
    ${decls(srv)}
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
    ${decls(srv)}
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
    ${decls(srv)}
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
  const out = CASES.map(([n, d, b, imp, extra]) => [n, page(side, d, b, imp ?? ""), extra ? extra(srv) : undefined]);
  if (side === "server" || side === "fullstack") {
    for (const [n, b] of TAGGED) out.push([n, page(side, TAG_FNS, b)]);
  }
  return out;
}
