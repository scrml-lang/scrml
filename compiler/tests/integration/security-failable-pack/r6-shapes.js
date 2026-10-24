// S469 s469-server-return-match-await round 5b (review of cf01c66b8) — on every side (server `s9`,
// fullstack `f6`, library `l4`, tool `t4`):
//   - `?` from an IMPORTED callee whose enum has the SAME NAME as the enclosing enum but different fields
//     (an aliased enclosing name, `import { check as c }`, the enclosing enum from a third file, an
//     extra field; positional / `return match` / short-form readers): refused (E-ERROR-010) — enums
//     are never equal by name;
//   - the same names with different field TYPES (`code: string` re-raised as `code: number`): refused;
//   - a short-form arm whose body reads its implicit `e` through an object shorthand, a nested `match`
//     arm, a tape, a template: refused (the "reads e" walk fails closed);
//   - the callee's error type an alias declared in a third file: `?` and a direct reader refused;
//   - `_ e :> e is not` over a unit variant: `e` is the whole error (never absent) — correct.
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const AUTH = (srv, extraField = "") => `\${
    export type AuthErr:enum = { Denied(reason: string${extraField}), Gone }
    export ${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad"${extraField ? ", 1" : ""})
        return true
    }
}
`;
const READERS = {
  "positional": `const v = wrap(p) !{ .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
        return v == true ? "LOGGED IN" : v`,
  "return match": `return match wrap(p) { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`,
  "short form": `const v = wrap(p) !{
            Denied :> e == "bad" ? "rejected" : "LOGGED IN"
            Gone :> "rejected"
        }
        return v == true ? "LOGGED IN" : v`,
};
const WRAP = (srv, ty, call = "check(p)") => `${srv}function wrap(p)! -> ${ty} {
        const ok = ${call}?
        return ok
    }`;

function cases(srv) {
  const out = [];
  const LOCAL = `type AuthErr:enum = { Denied(note: string), Gone }`;
  for (const [rn, r] of Object.entries(READERS)) {
    out.push([`same-name imported enum, ${rn}`, `${LOCAL}\n    ${WRAP(srv, "AuthErr")}`, r, `import { check } from "./auth.scrml"`, { "auth.scrml": AUTH(srv) }]);
  }
  out.push(["same-name imported enum, aliased enclosing name", `${LOCAL}\n    type AE2 = AuthErr\n    ${WRAP(srv, "AE2")}`, READERS.positional, `import { check } from "./auth.scrml"`, { "auth.scrml": AUTH(srv) }]);
  out.push(["same-name imported enum, import { check as c }", `${LOCAL}\n    ${WRAP(srv, "AuthErr", "c(p)")}`, READERS.positional, `import { check as c } from "./auth.scrml"`, { "auth.scrml": AUTH(srv) }]);
  out.push(["same-name enclosing enum imported from a third file", WRAP(srv, "AuthErr"), READERS.positional, `import { check } from "./auth.scrml"\nimport { AuthErr } from "./other.scrml"`, { "auth.scrml": AUTH(srv), "other.scrml": `\${\n    export type AuthErr:enum = { Denied(note: string), Gone }\n}\n` }]);
  out.push(["same-name imported enum, extra field", `${LOCAL}\n    ${WRAP(srv, "AuthErr")}`, READERS.positional, `import { check } from "./auth.scrml"`, { "auth.scrml": AUTH(srv, ", n: number") }]);
  // MED-1 — same names, different field types
  out.push(["same field names, different types", `type AuthErr5:enum = { Denied2(code: string), Gone2 }
    type Other5:enum = { Denied2(code: number), Gone2 }
    ${srv}function check(p)! -> AuthErr5 {
        if (p != "secret") fail AuthErr5::Denied2("401")
        return true
    }
    ${WRAP(srv, "Other5")}`, `const v = wrap(p) !{ .Denied2(c) :> c == 401 ? "rejected" : "LOGGED IN", .Gone2 :> "rejected" }
        return v == true ? "LOGGED IN" : v`]);
  // HIGH-2 — the short form's implicit e read through shapes the walk must not miss
  const SF = (srv, unit) => `type SE:enum = { ${unit ? "Denied" : "Denied2(code: number, reason: string)"}, Gone2 }
    ${srv}function sf(p)! -> SE {
        if (p != "secret") fail SE::${unit ? "Denied" : `Denied2(401, "bad")`}
        return true
    }`;
  const SFB = (unit, expr) => `const e = "ok"
        const v = sf(p) !{
            ${unit ? "Denied" : "Denied2"} :> ${expr} == "ok" ? "LOGGED IN" : "rejected"
            Gone2 :> "rejected"
        }
        return v == true ? "LOGGED IN" : v`;
  for (const [n, expr, unit] of [
    ["object shorthand", "({ e }).e", false],
    ["object shorthand among others", "({ x: 1, e }).e", false],
    ["nested object shorthand", "({ a: { e } }).a.e", false],
    ["shorthand in a tape", "[{ e }][0].e", false],
    ["nested match arm", `(match "x" { "x" :> e, else :> "" })`, false],
    ["shorthand in a template", "`${({ e }).e}`", false],
    ["unit variant, object shorthand", "({ e }).e", true],
  ]) out.push([`short form reads e via ${n}`, SF(srv, unit), SFB(unit, expr)]);
  // the callee's error type is an ALIAS declared in a THIRD file: `?` cannot check it (refused, fail
  // closed); a reader directly on the call cannot see its fields (refused rather than guessed)
  const T3 = (srv) => ({
    "types.scrml": `\${\n    export type AuthErr:enum = { Denied(reason: string), Gone }\n    export type AA = AuthErr\n}\n`,
    "auth.scrml": `import { AuthErr, AA } from "./types.scrml"\n\${\n    export ${srv}function check(p)! -> AA {\n        if (p != "secret") fail AuthErr::Denied("bad")\n        return true\n    }\n}\n`,
  });
  out.push(["? over a callee whose enum is an alias in a third file", `type Other:enum = { Denied(note: string), Gone }\n    ${WRAP(srv, "Other")}`, READERS.positional, `import { check } from "./auth.scrml"`, T3(srv)]);
  out.push(["reader on a callee whose enum is an alias in a third file", "", READERS.positional.replaceAll("wrap(p)", "check(p)"), `import { check } from "./auth.scrml"`, T3(srv)]);
  // M-2 — the whole error is never absent
  out.push(["whole binder over a unit variant, e is not absent", `type UE:enum = { Denied, Gone }
    ${srv}function ue(p)! -> UE {
        if (p != "secret") fail UE::Denied
        return true
    }`, `const v = ue(p) !{ _ e :> e is not ? "LOGGED IN" : "rejected" }
        return v == true ? "LOGGED IN" : v`]);
  return out;
}

function page(side, decls, body, imports = "") {
  if (side === "library") return `${imports}
\${
    ${decls}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
${imports}
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
  if (side === "server") return `${imports}
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
  return `${imports}
<msg> = "init"
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
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  return cases(srv).map(([n, d, b, imp, extra]) => [n, page(side, d, b, imp ?? ""), extra]);
}
