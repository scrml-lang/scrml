// S471 s471-null-in-arm-refused (family r22) — server `s25`, fullstack `f28`, library `l20`, tool `t20`.
// `g-impl1-null-in-expression-position-arm-not-refused-s470` (HIGH): SPEC §42.1 — `null` / `undefined`
// are not scrml tokens; §42.3.2 — comparing against them is E-SYNTAX-042. The GCP3 walker never read an
// expression-position `!{}` arm (carried as the TEXT of a placeholder call), so
// `(local(p) !{ _ :> [p].find(isOk) != null }) ? "LOGGED IN" : "rejected"` compiled: the comparison was
// emitted against JS `null`, which `find`'s not-found `undefined` never equals, and the wrong password
// logged in (the #1576 round-4 review, `~/.cache/scrml/review/s470-li4/runs/h16/024`, `025`). The same
// walker also skipped a statement guard's arms, an `if` used as a value, an arrow's block body and a
// template literal — each a position where the same comparison logged in.
//
// Every shape is a login: `local(p)` fails on a wrong password, its arm (or the position under test)
// compares `[p].find(isOk)` against an absence token, and `login(p)` returns "LOGGED IN" / "rejected".
// BAD shapes are FAIL on base `a8bac7248` and PASS-REFUSED after (E-SYNTAX-042). `VALID` controls spell
// absence the scrml way (`is given`) or test `some`, and must keep compiling.
// Data, not logic: `shapesFor(side)` returns [name, scrml source]. Do not edit a shape to make it pass.

const FIND = `[p].find(isOk)`;

// [name, body statements (each on its own line), value returned]
const BAD = [
  ["h16-024 expression-position arm, != null", [`const v = (local(p) !{ _ :> ${FIND} != null }) ? "LOGGED IN" : "rejected"`], `v`],
  ["expression-position arm, != undefined", [`const v = (local(p) !{ _ :> ${FIND} != undefined }) ? "LOGGED IN" : "rejected"`], `v`],
  ["expression-position arm returned directly", [], `(local(p) !{ _ :> ${FIND} != null }) ? "LOGGED IN" : "rejected"`],
  ["expression-position variant arm", [`const v = (local(p) !{ | .Denied(r) :> ${FIND} != null | _ :> false }) ? "LOGGED IN" : "rejected"`], `v`],
  ["expression-position braced arm", [`const v = (local(p) !{ _ :> { const r = ${FIND}\n r != null } }) ? "LOGGED IN" : "rejected"`], `v`],
  ["statement guard arm", [`const ok = local(p) !{ _ :> ${FIND} != null }`], `ok ? "LOGGED IN" : "rejected"`],
  ["statement guard braced arm", [`const ok = local(p) !{ _ :> { const r = ${FIND}\n r != null } }`], `ok ? "LOGGED IN" : "rejected"`],
  ["if used as a value", [`const ok = if (p != "") { ${FIND} != null } else { false }`], `ok ? "LOGGED IN" : "rejected"`],
  ["arrow block body", [`const f = (q) => { return [q].find(isOk) != null }`], `f(p) ? "LOGGED IN" : "rejected"`],
  ["template literal", [`const s = \`\${${FIND} != null}\``], `s == "true" ? "LOGGED IN" : "rejected"`],
  // `!= not` (E-EQ-002, §45) lowered to the same comparison against JS `null` — escaped in an arm too.
  ["expression-position arm, != not", [`const v = (local(p) !{ _ :> ${FIND} != not }) ? "LOGGED IN" : "rejected"`], `v`],
];

const VALID = [
  ["VALID expression-position arm, is given", [`const v = (local(p) !{ _ :> ${FIND} is given }) ? "LOGGED IN" : "rejected"`], `v`],
  ["VALID expression-position arm, some", [`const v = (local(p) !{ _ :> [p].some(isOk) }) ? "LOGGED IN" : "rejected"`], `v`],
];

const DECLS = (srv) => `${srv}function isOk(p) { return p == "secret" }
    type AuthErr:enum = { Denied(reason: string), Gone }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;

function page(side, stmts, ret) {
  const body = [...stmts, `return ${ret}`].join("\n        ");
  if (side === "library") return `\${\n    ${DECLS("")}\n    export function login(p) {\n        ${body}\n    }\n}\n`;
  if (side === "tool") return `<program kind="tool">\n\${\n    ${DECLS("")}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
  if (side === "server") return `<msg> = "init"\n\${\n    ${DECLS("server ")}\n    server function login(p) {\n        ${body}\n    }\n    function go() { @msg = login("wrong") !{ _ :> "err" } }\n}\n<button onclick=go()>go</button>\n<p>\${@msg}</p>\n`;
  return `<msg> = "init"\n\${\n    ${DECLS("server ")}\n    function login(p) {\n        ${body}\n    }\n    function go(p) { @msg = login(p) }\n}\n<button id="wrong" onclick=go("wrong")>go</button>\n<button id="right" onclick=go("secret")>go</button>\n<p id="out">\${@msg}</p>\n`;
}

export function shapesFor(side) {
  const out = [];
  for (const [n, stmts, ret] of [...BAD, ...VALID]) out.push([n, page(side, stmts, ret)]);
  return out;
}
