// S470 s470-typed-payload-binders, fix round 1 (adversarial review of 7453d57ff: FIX) — on every side
// (server `s15`, fullstack `f18`, library `l10`, tool `t10`). The review's probes b1–b6
// (~/.cache/scrml/review/s470-lb/b/) found forms whose type is STATICALLY an enum that the lane's check
// missed, because the enum fact was read per syntactic form instead of from the type:
//   - B-ALIAS: `type I2 = Inner` — a parameter, local, tape, return, struct field, imported alias;
//   - B-UNITRET: a function whose returns mix a payload constructor and a UNIT variant, a ternary, a local;
//   - B-IMPORTFN: an imported `function mkT(p) -> Inner`, an imported constructor-returning function,
//     an imported `const` bound to a constructor;
//   - B-FLOW: a ternary / `||` of enum values, `lin x = E.V(…)`, destructuring of a typed tape, a typed
//     tape's `.find` / `.at` / callback parameter, a value `match` yielding typed values, a closure's result;
//   - X-ADV / X-HIST: `@x.advance` exempt only on an engine cell, `.V.history` only where a cell is written.
// Every shape here is FAIL on 7453d57ff on its side and PASS-REFUSED after (E-TYPE-004). Shapes that could
// not fail on a side there are left off that side (SKIP below). Data, not logic: `shapesFor(side)` returns
// [name, scrml source, extraFiles?]. Do not edit a shape to make it pass.

const DD = (srv) => `${srv}function ping(q) { return q }
    type Inner:enum = { Bad(reason: string), Ok2 }
    type I2 = Inner
    type S:struct = { i: I2 }
    type Sx:struct = { i: Inner }
    function mkT(p) -> Inner {
        if (p != "secret") return Inner::Bad("bad")
        return Inner.Ok2
    }
    function mkU(p) {
        if (p != "secret") return Inner::Bad("bad")
        return Inner.Ok2
    }
    function mkM(p) { return p != "secret" ? Inner::Bad("bad") : Inner.Ok2 }
    function mkW(p) {
        const r = Inner::Bad("bad")
        return p != "secret" ? r : Inner.Ok2
    }
    function r2(p) {
        if (p != "secret") return Inner::Bad("bad")
        return Inner::Ok2
    }
    function r3(p) {
        if (p != "secret") return Inner::Bad("bad")
        return .Ok2
    }
    function r4(p) -> I2 { return Inner::Bad("bad") }`;
const R = (x) => `return ${x}.reason == "bad" ? "rejected" : "LOGGED IN"`;
const LOCAL = [
  ["1 A2 ternary of two constructors", `const x = p != "secret" ? Inner::Bad("bad") : Inner.Ok2\n        ${R("x")}`],
  ["1 A4 || of two constructors", `const x = Inner::Bad("bad") || Inner.Ok2\n        ${R("x")}`],
  ["1 A8 fn returns a constructor and a unit variant", `const x = mkU(p)\n        ${R("x")}`],
  ["1 A9 fn returns a ternary", `const x = mkM(p)\n        ${R("x")}`],
  ["1 A10 fn returns through a local", `const x = mkW(p)\n        ${R("x")}`],
  ["1 B2 fn returns E::Unit", `const x = r2(p)\n        ${R("x")}`],
  ["1 B3 fn returns .Unit", `const x = r3(p)\n        ${R("x")}`],
  ["1 B4 declared alias return", `const x = r4(p)\n        ${R("x")}`],
  ["1 B6 alias-typed parameter", `function g(y: I2) { return y.reason }\n        return g(Inner::Bad("bad")) == "bad" ? "rejected" : "LOGGED IN"`],
  ["1 A13b alias-typed local", `const x: I2 = Inner::Bad("bad")\n        ${R("x")}`],
  ["1 B8 alias tape", `const xs: I2[] = [Inner::Bad("bad")]\n        ${R("xs[0]")}`],
  ["1 A16 struct field of alias type", `const s: S = { i: Inner::Bad("bad") }\n        ${R("s.i")}`],
  ["1 A19 closure result", `const f = () => Inner::Bad("bad")\n        const x = f()\n        ${R("x")}`],
  ["1 B9 typed tape .find", `const xs: Inner[] = [Inner::Bad("bad")]\n        ${R("xs.find((v) => true)")}`],
  ["1 B10 typed tape .at", `const xs: Inner[] = [Inner::Bad("bad")]\n        ${R("xs.at(0)")}`],
  ["1 B11 typed tape callback parameter", `const xs: Inner[] = [Inner::Bad("bad")]\n        return xs.map((v) => v.reason)[0] == "bad" ? "rejected" : "LOGGED IN"`],
  ["1 B12 typed tape destructured", `const xs: Inner[] = [Inner::Bad("bad")]\n        const [x] = xs\n        ${R("x")}`],
  ["1 B14 ternary of typed locals", `const a: Inner = Inner::Bad("bad")\n        const x = p != "" ? a : a\n        ${R("x")}`],
  ["1 A29 lin bound to a constructor", `lin x = Inner::Bad("bad")\n        ${R("x")}`],
  ["1 B20 value match yielding typed values", `const a: Inner = Inner::Bad("bad")\n        const x = match a { .Bad(r) :> a, else :> a }\n        ${R("x")}`],
];
const EXEMPT = `type Ad:enum = { Bad(advance: string), Ok2 }
    type Hi:enum = { Bad(history: string), Ok2 }`;
const EX = [
  ["1 X6 .V.history read outside the restore form", `return Hi.Bad.history == "bad" ? "rejected" : "LOGGED IN"`],
];
const HMOD = `\${
    export type Inner:enum = { Bad(reason: string), Ok2 }
    export const badC = Inner::Bad("bad")
    export function mkI(p) { return Inner::Bad("bad") }
    export function mkT(p) -> Inner { return Inner::Bad("bad") }
    export type I3 = Inner
}
`;
const IMP = `import { Inner, badC, mkI, mkT, I3 } from "./h.scrml"`;
const IMPORTED = [
  ["1 C1 imported const bound to a constructor", R("badC")],
  ["1 C2 imported constructor-returning fn", `const x = mkI(p)\n        ${R("x")}`],
  ["1 C3 imported fn declared -> Inner", `const x = mkT(p)\n        ${R("x")}`],
  ["1 C4 imported alias-typed local", `const x: I3 = Inner::Bad("bad")\n        ${R("x")}`],
];
// fullstack only: cells
const CELLS = [
  ["1 X2a non-engine cell's payload field named advance", `return @ac.advance == "bad" ? "rejected" : "LOGGED IN"`, `<ac>: Ad = Ad::Bad("bad")`],
];

// Shapes that could not fail on 7453d57ff on a side (refused or not judgeable there for another reason).
// Measured: library / tool compile an importing file's own `import` of `./h.scrml` as E-CODEGEN-INVALID-LOGIC
// (g-library-tool-cross-file-import-source-path-s469); the server bundle of C1 / C4 does not load
// (g-server-js-imports-module-without-server-file-s467).
const SKIP = new Set([
  ...["library", "tool"].flatMap((s) => ["1 C1 imported const bound to a constructor", "1 C2 imported constructor-returning fn",
    "1 C3 imported fn declared -> Inner", "1 C4 imported alias-typed local"].map((n) => `${s}/${n}`)),
  "server/1 C1 imported const bound to a constructor",
  "server/1 C4 imported alias-typed local",
]);

function page(side, d, body, imports = "", cell = "") {
  if (side === "library") return `${imports}\n\${\n    ${d}\n    export function login(p) {\n        ${body}\n    }\n}\n`;
  if (side === "tool") return `<program kind="tool">\n${imports}\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
  if (side === "server") return `${imports}\n<msg> = "init"\n\${\n    ${d}\n    server function login(p) {\n        ${body}\n    }\n    function go() { @msg = login("wrong") !{ _ :> "err" } }\n}\n<button onclick=go()>go</button>\n<p>\${@msg}</p>\n`;
  return `${imports}\n<msg> = "init"\n${cell}\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function go(p) { @msg = login(p) }\n}\n<button id="wrong" onclick=go("wrong")>go</button>\n<button id="right" onclick=go("secret")>go</button>\n<p id="out">\${@msg}</p>\n`;
}

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = [];
  for (const [n, b] of LOCAL) out.push([n, page(side, DD(srv), b), undefined]);
  for (const [n, b] of EX) out.push([n, page(side, `${srv}function ping(q) { return q }\n    ${EXEMPT}`, b), undefined]);
  for (const [n, b] of IMPORTED) out.push([n, page(side, `${srv}function ping(q) { return q }`, b, IMP), { "h.scrml": HMOD }]);
  if (side === "fullstack") {
    for (const [n, b, cell] of CELLS) out.push([n, page(side, `${srv}function ping(q) { return q }\n    ${EXEMPT}\n    type Inner:enum = { Bad(reason: string), Ok2 }`, b, "", cell), undefined]);
  }
  return out.filter(([n]) => !SKIP.has(`${side}/${n}`));
}
