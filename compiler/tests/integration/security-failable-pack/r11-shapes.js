// S470 s470-typed-payload-binders, fix round 2 (adversarial review of baef28219: FIX) — on every side
// (server `s14`, fullstack `f17`, library `l9`, tool `t9`). The review's probes b7 / b8 / perf
// (~/.cache/scrml/review/s470-lb2/b/) found three holes inside the round-1 type reader:
//   - K-ALIAS2: an alias of an alias across an import (`h2` imports `I2` and exports `type I3 = I2`,
//     `type I3L = I2[]`; an importer's local `type L4 = I3`);
//   - U-NOT: a function returning a constructor OR `not` / a bare `return`, a ternary with `not`, a
//     pass-through local, an optional read — the result is `E | not`, refused as a declared one is;
//   - U-REC: a recursive return, a cycle of functions.
// Every "1 …" shape is FAIL on baef28219 on its side and PASS-REFUSED after (E-TYPE-004); shapes that could
// not fail on a side there are left off it (SKIP). "VALID …" shapes are acceptance controls (pinned PASS):
// the review's fp2 programs (alias, return inference, callbacks), each declared beside a login that must
// still compile and run. Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?].
// Do not edit a shape to make it pass.

const DD = (srv) => `${srv}function ping(q) { return q }
    type Inner:enum = { Bad(reason: string), Ok2 }
    function m1(p) {
        if (p != "secret") return Inner::Bad("bad")
        return not
    }
    function m3(p, n) {
        if (p != "secret") return Inner::Bad("bad")
        if (n > 0) return m3(p, n - 1)
        return Inner::Ok2
    }
    function m7(p) {
        if (p != "secret") return Inner::Bad("bad")
        return
    }
    function m8(p) {
        const r = m1(p)
        return r
    }
    function m9(p) { return p != "secret" ? Inner::Bad("bad") : not }
    function h0(p) { return p > 0 ? Inner.Ok2 : h1(p - 1) }
    function h1(p) { return p > 1 ? Inner.Ok2 : h2(p - 1) }
    function h2(p) { return p > 2 ? Inner::Bad("bad") : h0(p - 1) }`;
const R = (x) => `return ${x}.reason == "bad" ? "rejected" : "LOGGED IN"`;
const G = `if (p == "secret") { return "LOGGED IN" }\n        `;
const RET = [
  ["1 U1 returns a constructor or not", `const x = m1(p)\n        ${R("x")}`],
  ["1 U3 recursive return", `const x = m3(p, 2)\n        ${R("x")}`],
  ["1 U7 returns a constructor or a bare return", `const x = m7(p)\n        ${R("x")}`],
  ["1 U8 passes an E | not result through a local", `const x = m8(p)\n        ${R("x")}`],
  ["1 U9 ternary of a constructor and not", `const x = m9(p)\n        ${R("x")}`],
  ["1 U13 optional read of an E | not result", `const x = m1(p)\n        return x?.reason == "bad" ? "rejected" : "LOGGED IN"`],
  ["1 U-REC cycle of functions", `${G}const x = h0(3)\n        ${R("x")}`],
];
const H = `\${
    export type Inner:enum = { Bad(reason: string), Ok2 }
    export type I2 = Inner
}
`;
const H2 = `import { I2 } from "./h.scrml"
\${
    export type I3 = I2
    export type I3L = I2[]
}
`;
const KIMP = `import { Inner } from "./h.scrml"\nimport { I3, I3L } from "./h2.scrml"\nimport { I2 } from "./h.scrml"`;
const ALIAS2 = [
  ["1 K1 imported alias of an imported alias", `const x: I3 = Inner::Bad("bad")\n        ${R("x")}`],
  ["1 K2 imported tape alias of an imported alias", `const xs: I3L = [Inner::Bad("bad")]\n        ${R("xs[0]")}`],
  ["1 K3 local alias of an imported alias", `const x: L4 = Inner::Bad("bad")\n        ${R("x")}`],
];
const VDECL = `type Role:enum = { Admin, Member(since: number), Banned(reason: string) }
    type R2 = Role
    type User:struct = { name: string, role: Role, tags: string[] }
    type U2 = User
    type UL = User[]
    type RL = R2[]`;
const VALID = [
  ["VALID W1 struct alias field", `function f(u: U2) { return u.name + u.role.variant }`],
  ["VALID W2 struct alias tape", `function f(us: UL) { return us[0].name + us.find((u) => true).name }`],
  ["VALID W3 enum alias .variant", `function f(r: R2) { return r.variant }`],
  ["VALID W4 enum alias tape callbacks", `function f(rs: RL) { return rs.map((r) => r.variant).join(",") + rs.filter((r) => r is .Admin).length }`],
  ["VALID W5 reduce accumulator", `function f(rs: Role[]) { return rs.reduce((acc, r) => acc + r.variant.length, 0) }`],
  ["VALID W6 sort comparator", `function f(rs: Role[]) { return rs.toSorted((a, b) => a.variant.length - b.variant.length).length }`],
  ["VALID W7 findIndex", `function f(rs: Role[]) { return rs.findIndex((r) => r is .Admin) + 1 }`],
  ["VALID W8 inferred enum return then variant", `function mk(p) { if (p) return Role.Admin\n return Role::Banned("x") }\n    function f() { return mk(true).variant }`],
  ["VALID W9 inferred struct return field", `function mk() { return { name: "a", role: Role.Admin, tags: [] } }\n    function f() { return mk().name }`],
  ["VALID W10 enum return then match payload", `function mk(p) { if (p) return Role.Admin\n return Role::Banned("x") }\n    function f() { return match mk(false) { .Banned(w) :> w.length, else :> 0 } }`],
  ["VALID W11 destructured tape then variant", `function f(rs: Role[]) { const [a, b] = rs\n return a.variant + b.variant }`],
  ["VALID W12 ternary enum then is", `function f(p) { const x = p ? Role.Admin : Role::Banned("z")\n return x is .Admin }`],
  ["VALID W13 lin enum variant", `function f() { lin x = Role.Admin\n return x.variant }`],
  ["VALID W14 IIFE enum variant", `function f() { return (() => Role.Admin)().variant }`],
  ["VALID W15 tape of tapes", `function f(rs: Role[][]) { return rs[0].length + rs.at(0).length }`],
  ["VALID W16 struct from a fn with an enum field", `function mk(): User { return { name: "a", role: Role.Admin, tags: [] } }\n    function f() { return mk().role.variant + mk().tags.length }`],
  ["VALID W17 recursive fn of numbers", `function fib(n) { if (n < 2) return n\n return fib(n - 1) + fib(n - 2) }\n    function f() { return fib(10).toFixed(0) }`],
  ["VALID W18 pop / shift then variant", `function f(rs: Role[]) { const a = rs.pop()\n const b = rs.shift()\n return a.variant + b.variant }`],
];

// S470 fix round 3 (pack-control strength) — each VALID control CALLS its `f` in `login` at run time, so its
// behaviour runs, not only its acceptance (a throw would surface as PASS-500 / PASS-DENY against the pin).
// Arguments use payload variants where `f` reads `.variant` further (a UNIT variant's `.variant` reads `not` on
// impl#1 — a separate pre-existing runtime defect, reported, not exercised here).
const B1 = `Role::Banned("x")`;
const USER = `{ name: "a", role: ${B1}, tags: [] }`;
const VCALL = {
  W1: `f(${USER})`, W2: `f([${USER}])`, W3: `f(${B1})`, W4: `f([${B1}])`, W5: `f([${B1}])`, W6: `f([${B1}, Role::Member(1)])`,
  W7: `f([${B1}])`, W8: `f()`, W9: `f()`, W10: `f()`, W11: `f([${B1}, ${B1}])`, W12: `f(true)`, W13: `f()`, W14: `f()`,
  W15: `f([[${B1}]])`, W16: `f()`, W17: `f()`, W18: `f([${B1}, ${B1}])`,
};
const VBODY = (n) => `const r0 = ${VCALL[n.split(" ")[1]]}\n        ${G}return "rejected"`;

// Shapes that could not fail on baef28219 on a side (measured), and the library / tool importer
// limitation (g-library-tool-cross-file-import-source-path-s469).
const SKIP = new Set([
  ...["library", "tool"].flatMap((s) => ALIAS2.map(([n]) => `${s}/${n}`)),
  // server: K1–K3 do not load there (g-server-js-imports-module-without-server-file-s467); U1 / U13 / U-REC are
  // PASS-500 on baef28219 (the server route throws at run time) — measured.
  ...["1 K1 imported alias of an imported alias", "1 K2 imported tape alias of an imported alias", "1 K3 local alias of an imported alias",
    "1 U1 returns a constructor or not", "1 U13 optional read of an E | not result", "1 U-REC cycle of functions"].map((n) => `server/${n}`),
  // tool: a `return match` is refused there on every tree (g-impl1-async-match-positions-refused-s469).
  "tool/VALID W10 enum return then match payload",
  // server: `f` calls a local function (`mk`) the server bundle does not ship once `login` calls `f` (PASS-500,
  // "mk is not defined", the same on 73d4e2e2d) — a separate pre-existing defect, reported.
  "server/VALID W10 enum return then match payload",
]);

function page(side, d, body, imports = "") {
  if (side === "library") return `${imports}\n\${\n    ${d}\n    export function login(p) {\n        ${body}\n    }\n}\n`;
  if (side === "tool") return `<program kind="tool">\n${imports}\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
  if (side === "server") return `${imports}\n<msg> = "init"\n\${\n    ${d}\n    server function login(p) {\n        ${body}\n    }\n    function go() { @msg = login("wrong") !{ _ :> "err" } }\n}\n<button onclick=go()>go</button>\n<p>\${@msg}</p>\n`;
  return `${imports}\n<msg> = "init"\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function go(p) { @msg = login(p) }\n}\n<button id="wrong" onclick=go("wrong")>go</button>\n<button id="right" onclick=go("secret")>go</button>\n<p id="out">\${@msg}</p>\n`;
}

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = [];
  for (const [n, b] of RET) out.push([n, page(side, DD(srv), b), undefined]);
  for (const [n, b] of ALIAS2) out.push([n, page(side, `${srv}function ping(q) { return q }\n    type L4 = I3`, b, KIMP), { "h.scrml": H, "h2.scrml": H2 }]);
  for (const [n, f] of VALID) out.push([n, page(side, `${srv}function ping(q) { return q }\n    ${VDECL}\n    ${f}`, VBODY(n)), undefined]);
  return out.filter(([n]) => !SKIP.has(`${side}/${n}`));
}
