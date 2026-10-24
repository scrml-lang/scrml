// Probe family `f2` — S469 s469-server-return-match-await round 2 (review of bc33320a7), the CLIENT half
// (SIDE `fullstack`: the page runs under happy-dom; its `fetch` is answered in-process by every
// compiled `.server.js` of the shape). (1) HIGH 1 — the payload shape across files (see s5.js). (2) HIGH 2
// — a MEMBER call in a match arm (`q.includes("ecre")`) read as a call of a same-named SERVER function
// (`server function includes`): the sync helper was coloured async, and every render-position use read
// a pending Promise — always truthy; plus the genuine class (a helper that IS async, in each render
// position). (3) HIGH 3 — a nested `match` as an arm value whose subject is a server call. Data, not
// logic. Do not edit a shape to make it pass.
//
// Measured on b35babcc2 (base) / bc33320a7 (round 1) / round 2 — see README.md.

export const SIDE = "fullstack";

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
const CLI = (imp, body) => `${imp}
<msg> = "init"
\${
    function login(p) {
        ${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
const shapes = [];
for (const [dn, imp, extra] of [
  ["enum declared by the producer, imported", `import { check, AuthErr } from "./auth.scrml"`, { "auth.scrml": AUTH_DECL }],
  ["enum declared by the producer, not imported", `import { check } from "./auth.scrml"`, { "auth.scrml": AUTH_DECL }],
  ["producer imports the enum", `import { check } from "./auth.scrml"\nimport { AuthErr } from "./types.scrml"`, { "auth.scrml": AUTH_IMP, "types.scrml": TYPES }],
]) {
  shapes.push([`${dn}: return match, positional`, CLI(imp, `return match check(p) { ${POS} }`), extra]);
  shapes.push([`${dn}: return match, named`, CLI(imp, `return match check(p) { ${NAMED} }`), extra]);
  shapes.push([`${dn}: !{}, positional`, CLI(imp, `const v = check(p) !{ ${BPOS} }\n        return v == true ? "LOGGED IN" : v`), extra]);
  shapes.push([`${dn}: !{}, named`, CLI(imp, `const v = check(p) !{ ${BNAMED} }\n        return v == true ? "LOGGED IN" : v`), extra]);
}

// HIGH 2 — a member call in a match arm, and the genuine async helper, in each render position.
const P = (helper, view) => `<pw> = ""
\${
    server function includes(x) { return false }
    server function isOk(p) { return p == "secret" }
${helper}
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${view}
`;
const H = {
  "an expression": `    function allowed(q) { const s: string = q\n        return String(match s { "" :> false, else :> q.includes("ecre") }) == "true" }`,
  "a return": `    function allowed(q) { const s: string = q\n        return match s { "" :> false, else :> q.includes("ecre") } }`,
  "a declaration": `    function allowed(q) { const s: string = q\n        const v = match s { "" :> false, else :> q.includes("ecre") }\n        return v }`,
  "a statement": `    function allowed(q) { const s: string = q\n        let v = false\n        match s { "" :> { v = false } else :> { v = q.includes("ecre") } }\n        return v }`,
};
const VIEWS = {
  "if= with &&": `<p id="out"><span if=\${@pw != "" && allowed(@pw)}>LOGGED IN</span></p>`,
  "bare if=": `<p id="out"><span if=\${allowed(@pw)}>LOGGED IN</span></p>`,
  "derived cell": `\${ const <ok> = @pw != "" && allowed(@pw) }\n<p id="out">\${@ok ? "LOGGED IN" : "rejected"}</p>`,
  "interpolation": `<p id="out">\${@pw != "" && allowed(@pw) ? "LOGGED IN" : "rejected"}</p>`,
};
for (const [hn, h] of Object.entries(H)) {
  for (const [vn, v] of Object.entries(VIEWS)) shapes.push([`member call in ${hn} match arm, ${vn}`, P(h, v)]);
}
for (const [vn, v] of Object.entries(VIEWS)) shapes.push([`async helper, ${vn}`, P(`    function allowed(q) { return isOk(q) }`, v)]);

// HIGH 3 — a nested match as an arm value.
const NEST = `match check(p) { .Denied(r) :> "rejected", .Gone :> "rejected", else :> "LOGGED IN" }`;
const L = (body) => `type AuthErr:enum = { Denied(reason: string), Gone }
<msg> = "init"
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) {
        const s: string = p
${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
for (const [n, b] of Object.entries({
  "return match": `        return match s { "" :> "rejected", else :> ${NEST} }`,
  "return match, newline arms": `        return match s {\n            "" :> "rejected"\n            else :> ${NEST}\n        }`,
  "const match": `        const v = match s { "" :> "rejected", else :> ${NEST} }\n        return v`,
  "reassignment": `        let v = ""\n        v = match s { "" :> "rejected", else :> ${NEST} }\n        return v`,
  "call argument": `        return String(match s { "" :> "rejected", else :> ${NEST} })`,
})) shapes.push([`nested match arm value, ${n}`, L(b)]);
export default shapes;
