// Probe family `s5` — S469 s469-server-return-match-await round 2 (review of bc33320a7), the SERVER half.
// (1) HIGH 1 — the payload shape across files: a `fail` in the module that declares (or imports) the
// error enum, read by a `match` / `!{}` arm binder in the importing module, positional and named. The
// shape used to be decided per FILE (does this file declare the variant?), so the producer and the
// reader disagreed and a deny-list on the binder logged a denied input in. (2) HIGH 3 — a nested
// `match` as an ARM VALUE whose subject is a server call. Side: server (POST the `login` route).
// Data, not logic: the default export is a list of [name, scrml source, extraFiles?]. Do not edit a
// shape to make it pass.
//
// Measured on b35babcc2 (base) / bc33320a7 (round 1) / round 2 — see README.md (S469
// s469-server-return-match-await round 2 section).

export const SIDE = "server";

const AUTH_DECL = `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
    export server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
`;
const TYPES = `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
}
`;
const AUTH_IMP = `import { AuthErr } from "./types.scrml"
\${
    export server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
`;
const POS = `.Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN"`;
const NAMED = `.Denied(reason: x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN"`;
const BPOS = `.Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected"`;
const BNAMED = `.Denied(reason: x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected"`;
const SRV = (imp, arms) => `${imp}
<msg> = "init"
\${
    server function login(p) {
        return match check(p) { ${arms} }
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
const SRVBANG = (imp, arms) => `${imp}
<msg> = "init"
\${
    server function login(p) {
        const v = check(p) !{ ${arms} }
        return v == true ? "LOGGED IN" : v
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
const shapes = [];
for (const [dn, imp, extra] of [
  ["enum declared by the producer, imported", `import { check, AuthErr } from "./auth.scrml"`, { "auth.scrml": AUTH_DECL }],
  ["enum declared by the producer, not imported", `import { check } from "./auth.scrml"`, { "auth.scrml": AUTH_DECL }],
  ["producer imports the enum", `import { check } from "./auth.scrml"\nimport { AuthErr } from "./types.scrml"`, { "auth.scrml": AUTH_IMP, "types.scrml": TYPES }],
]) {
  shapes.push([`${dn}: return match, positional`, SRV(imp, POS), extra]);
  shapes.push([`${dn}: return match, named`, SRV(imp, NAMED), extra]);
  shapes.push([`${dn}: !{}, positional`, SRVBANG(imp, BPOS), extra]);
  shapes.push([`${dn}: !{}, named`, SRVBANG(imp, BNAMED), extra]);
}

// HIGH 3 — a nested match as an arm value.
const NEST = `match check(p) { .Denied(r) :> "rejected", .Gone :> "rejected", else :> "LOGGED IN" }`;
const S = (body) => `type AuthErr:enum = { Denied(reason: string), Gone }
<msg> = "init"
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    server function login(p) {
        const s: string = p
${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
for (const [n, b] of Object.entries({
  "return match": `        return match s { "" :> "rejected", else :> ${NEST} }`,
  "return match, newline arms": `        return match s {\n            "" :> "rejected"\n            else :> ${NEST}\n        }`,
  "const match": `        const v = match s { "" :> "rejected", else :> ${NEST} }\n        return v`,
  "reassignment": `        let v = ""\n        v = match s { "" :> "rejected", else :> ${NEST} }\n        return v`,
  "call argument": `        return String(match s { "" :> "rejected", else :> ${NEST} })`,
})) shapes.push([`nested match arm value, ${n}`, S(b)]);
export default shapes;
