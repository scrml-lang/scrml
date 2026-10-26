// S469 s469-server-return-match-await round 6 (review of 716ee804e) — on every side (server `s10`,
// fullstack `f7`, library `l5`, tool `t5`):
//   - HIGH-A: the whole-error binder `_ e :>` is checked by an ALLOW-list — every other use is refused:
//     payload reads in every spelling (`e["reason"]`, a helper — typed with the enum or not —, a
//     lambda, a destructuring lambda, a tagged template), block-arm reads (destructure, a local alias,
//     `let s = e`), comparisons (`e == bad`, `e == "ba" + "d"`, `String(e) == …`, `` `${e}` == … ``,
//     `[e][0] == …`, `({x: e}).x == …`, a literal `match e` arm), a cell write; the allowed uses
//     (`match e` over its variants, `is`, `e.variant`, a helper typed with the SAME enum, `log`) work;
//   - HIGH-B: an imported callee's enum, with a same-named LOCAL enum (or the enum from a third file,
//     or an unresolvable callee): `match e` / `describe(e)` never read the local enum's fields;
//     `match e` with no local enum at all works;
//   - MED: `?` compares canonical field types (aliases, same-named aliases / structs / nested enums
//     declared differently in another file).
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const ENUM = `type AuthErr:enum = { Denied(reason: string), Gone }`;

// `describe` (a `return match`) only where a shape uses it: a tool-mode function's `return match` is
// refused on every tree (g-impl1-async-match-positions-refused-s469), which would refuse every shape.
// S470 s470-typed-payload-binders (fix round 1, PIN-COV): `getReasonT(x: AuthErr) { return x.reason }` is
// itself a member read off an enum value (E-TYPE-004 under the S470 ruling "(B) Type the binders"), so it is
// declared only where a shape uses it — else every shape here would be refused by the prelude, not by its own body.
function decls(srv, withDescribe = false, withT = false) {
  return `${ENUM}
    type Phase:enum = { Idle, Failed(err: AuthErr) }
    const bad = "bad"
    ${srv}function getReason(x) { return x.reason }
    ${withT ? `${srv}function getReasonT(x: AuthErr) { return x.reason }` : ""}
    ${withDescribe ? `${srv}function describe(x: AuthErr) { return match x { .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" } }` : ""}
    ${srv}function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
}
const X = (cond) => `const v = wrap(p) !{ _ e :> ${cond} ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`;
// S470 (ruling "Emit E-ERROR-012", SPEC §19.4.3): the `!{ }` result `v` is READ, so its arm is in a value position
// and must yield a value — the block ends in `false` (before, a fall-through arm left the error envelope in `v`,
// which `v == true` read as not-true: the same outcome these shapes judge).
const B = (blk) => `let o = "LOGGED IN"
        const v = wrap(p) !{ _ e :> {
            ${blk}
            false
        } }
        return v == true ? "LOGGED IN" : o`;

const A = [
  ["A index", X(`e["reason"] == "bad"`)],
  ["A helper untyped", X(`getReason(e) == "bad"`)],
  ["A helper typed with the enum", X(`getReasonT(e) == "bad"`)],
  ["A lambda param member", X(`((x) => x.reason)(e) == "bad"`)],
  ["A lambda destructure", X(`(({ reason }) => reason)(e) == "bad"`)],
  ["A tagged template member", X("String`${e.reason}` == \"bad\"")],
  ["A block destructure", B(`const { reason } = e\n            if (reason == "bad") { o = "rejected" }`)],
  ["A block alias member", B(`const err = e\n            if (err.reason == "bad") { o = "rejected" }`)],
  ["A block let then compare", B(`let s = e\n            if (s == "bad") { o = "rejected" }`)],
  ["A eq const", X(`e == bad`)],
  ["A eq concat", X(`e == "ba" + "d"`)],
  ["A String(e)", X(`String(e) == "bad"`)],
  ["A template of e", X("`${e}` == \"bad\"")],
  ["A tape wrap", X(`[e][0] == "bad"`)],
  ["A object wrap", X(`({ x: e }).x == "bad"`)],
  ["A match e literal arm", X(`(match e { "bad" :> true, else :> false })`)],
  ["A inverted if(e)", B(`if (e) { o = "LOGGED IN" }`)],
  // valid
  ["VALID is variant", X(`e is .Denied`)],
  ["VALID e.variant", X(`e.variant == "Denied"`)],
  ["VALID match e", `const v = wrap(p) !{ _ e :> match e { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", else :> "rejected" } }
        return v == true ? "LOGGED IN" : v`],
  ["VALID describe(e) typed with the same enum", `const v = wrap(p) !{ _ e :> describe(e) }
        return v == true ? "LOGGED IN" : v`],
  ["VALID into a variant typed with the enum", B(`const ph = Phase.Failed(e)\n            o = match ph { .Failed(x) :> "rejected", else :> "LOGGED IN" }`)],
  ["VALID logged", B(`log("denied", e)\n            o = "rejected"`)],
  // the `_ e` arm of a value `match` over the failable call (refused on every tree)
  ["A match-form _ e member", `return match wrap(p) { .Ok :> "LOGGED IN", _ e :> e.reason == "bad" ? "rejected" : "LOGGED IN" }`],
];

const AUTH = (srv, decl = `export ${ENUM}`, imp = "", ty = "AuthErr") => `${imp}
\${
    ${decl}
    export ${srv}function check(p)! -> ${ty} {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
`;
const LOCAL = `type AuthErr:enum = { Denied(note: string), Gone }`;
const WM = `const v = check(p) !{ _ e :> match e { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", else :> "rejected" } }
        return v == true ? "LOGGED IN" : v`;
const DS = `const v = check(p) !{ _ e :> describe(e) }
        return v == true ? "LOGGED IN" : v`;
const HOLD = `let o = "LOGGED IN"
        const v = check(p) !{ _ e :> { @held = e } }
        o = match @held { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", else :> "LOGGED IN" }
        return v == true ? "LOGGED IN" : o`;

function cases(srv) {
  const out = A.map(([n, b]) => [n, decls(srv, n.includes("describe"), n.includes("getReasonT") || n === "A helper typed with the enum"), b, "", null]);
  const IMP = `import { check } from "./auth.scrml"`;
  const DESC = `${srv}function describe(x: AuthErr) { return match x { .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" } }`;
  const ex = { "auth.scrml": AUTH(srv) };
  const exT = { "types.scrml": `\${\n    export ${ENUM}\n}\n`, "auth.scrml": AUTH(srv, "", `import { AuthErr } from "./types.scrml"`) };
  const exU = { "types.scrml": `\${\n    export ${ENUM}\n    export type AA = AuthErr\n}\n`, "auth.scrml": AUTH(srv, "", `import { AuthErr, AA } from "./types.scrml"`, "AA") };
  for (const [en, extra] of [["imported", ex], ["imported from a third file", exT]]) {
    out.push([`B ${en} enum + local same-name, match e`, LOCAL, WM, IMP, extra]);
    out.push([`B ${en} enum, no local enum, match e`, "", WM, IMP, extra]);
    out.push([`B ${en} enum + local same-name, describe(e: local)`, `${LOCAL}\n    ${DESC}`, DS, IMP, extra]);
  }
  out.push(["B unresolvable callee enum + local same-name, match e", LOCAL, WM, IMP, exU]);
  out.push(["B held in a cell then matched", `${LOCAL}\n    <held>: AuthErr | not = not`, HOLD, IMP, ex]);
  // MED — canonical field types
  const WR = (ty) => `${srv}function wrap(p)! -> ${ty} {\n        const ok = check(p)?\n        return ok\n    }`;
  const CHK = (ty, f) => `${srv}function check(p)! -> ${ty} {\n        if (p != "secret") fail ${f}\n        return true\n    }`;
  const RS = `const v = wrap(p) !{ .Denied(x) :> x == "401" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }\n        return v == true ? "LOGGED IN" : v`;
  const RN = `const v = wrap(p) !{ .Denied(x) :> x == 401 ? "rejected" : "LOGGED IN", .Gone :> "rejected" }\n        return v == true ? "LOGGED IN" : v`;
  out.push(["M alias fields over different base types", `type Code = number\n    type Code2 = string\n    type AuthErr:enum = { Denied(code: Code), Gone }\n    type Other:enum = { Denied(code: Code2), Gone }\n    ${CHK("AuthErr", "AuthErr::Denied(401)")}\n    ${WR("Other")}`, RS, "", null]);
  out.push(["M alias field over the same base type (valid)", `type Code = number\n    type AuthErr:enum = { Denied(code: Code), Gone }\n    type Other:enum = { Denied(code: number), Gone }\n    ${CHK("AuthErr", "AuthErr::Denied(401)")}\n    ${WR("Other")}`, RN, "", null]);
  out.push(["M same-named alias, other base type, other file", `type Code = string\n    type Other:enum = { Denied(code: Code), Gone }\n    ${WR("Other")}`, RS, IMP, { "auth.scrml": `\${\n    type Code = number\n    export type AuthErr:enum = { Denied(code: Code), Gone }\n    export ${CHK("AuthErr", "AuthErr::Denied(401)")}\n}\n` }]);
  out.push(["M same-named struct, other shape, other file", `type Info:struct = { v: string }\n    type Other:enum = { Denied(code: Info), Gone }\n    ${WR("Other")}`, `const v = wrap(p) !{ .Denied(x) :> x.v == "401" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }\n        return v == true ? "LOGGED IN" : v`, IMP, { "auth.scrml": `\${\n    type Info:struct = { v: number }\n    export type AuthErr:enum = { Denied(code: Info), Gone }\n    export ${CHK("AuthErr", "AuthErr::Denied({ v: 401 })")}\n}\n` }]);
  out.push(["M same-named nested enum, other variants, other file", `type Kind:enum = { Bad, Good }\n    type Other:enum = { Denied(code: Kind), Gone }\n    ${WR("Other")}`, `const v = wrap(p) !{ .Denied(x) :> x == .Bad ? "rejected" : "LOGGED IN", .Gone :> "rejected" }\n        return v == true ? "LOGGED IN" : v`, IMP, { "auth.scrml": `\${\n    type Kind:enum = { Wrong, Bad }\n    export type AuthErr:enum = { Denied(code: Kind), Gone }\n    export ${CHK("AuthErr", "AuthErr::Denied(Kind.Wrong)")}\n}\n` }]);
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
