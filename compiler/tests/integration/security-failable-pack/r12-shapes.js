// S470 s470-typed-payload-binders, fix round 3 (adversarial review of 73d4e2e2d: FIX) — (no server family),
// fullstack `f18`, library `l10`, tool `t10`. The review's probes (~/.cache/scrml/review/s470-lb3/):
//   - PENDING-POISON: a member of a cycle of functions inferred while another member was still being
//     inferred memoized an unknown result, so the read was unchecked — depending on which was inferred
//     first (b10 P1–P8);
//   - IMP-STRUCT: a struct field typed with an IMPORTED enum / alias / alias-of-alias read as unknown
//     (k/e2e R11, R11b, R11c, R11e);
//   - EXPORT-STAR (k/e2e R4) is covered by the unit tests, not here: on 73d4e2e2d the importing page's
//     client bundle throws at load (it imports the TYPE `I0` from the `export *` module, which exports no
//     value), so the shape cannot be measured FAIL there;
//   - DEPTH: a chain of imported aliases longer than impl#1 followed was unchecked; past the bound it
//     is now refused (E-TYPE-031, an impl#1 limit), not left open (k/chain9; here a chain of 80).
// Every shape is FAIL on 73d4e2e2d on its side and PASS-REFUSED after; shapes that could not fail on a
// side there are left off it (multi-file shapes are fullstack only: the library / tool importer and the
// server bundle of an importing file do not load — g-library-tool-cross-file-import-source-path-s469,
// g-server-js-imports-module-without-server-file-s467). Data, not logic: `shapesFor(side)` returns
// [name, scrml source, extraFiles?]. Do not edit a shape to make it pass.

const DD = (srv) => `${srv}function ping(q) { return q }
    type Inner:enum = { Bad(reason: string), Ok2 }
    function fa(p) {
        if (p != "secret") return Inner::Bad("bad")
        return ga(p)
    }
    function ga(p) { return fa("x") }
    function fb(p) { return gb(p) }
    function gb(p) {
        if (p != "secret") return Inner::Bad("bad")
        return fb("x")
    }
    function fc(p) { return gc(p) }
    function gc(p) { return hc(p) }
    function hc(p) {
        if (p != "secret") return Inner::Bad("bad")
        return fc("x")
    }`;
const R = (x) => `return ${x}.reason == "bad" ? "rejected" : "LOGGED IN"`;
const CYCLES = [
  ["1 P1 mutual: f returns g, g only f; call f", `const x = fa(p)\n        ${R("x")}`],
  ["1 P4 mutual: f only g; call g", `const x = gb(p)\n        ${R("x")}`],
  ["1 P6 3-cycle; call g", `const x = gc(p)\n        ${R("x")}`],
  ["1 P7 3-cycle; call h then f", `const y = hc(p)\n        const x = fc(p)\n        ${R("x")}`],
];
const H0 = `\${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export type I0 = Inner\n}\n`;
const GO = (chk, arg) => `<msg> = "init"
\${
    server function ping(q) { return q }
    ${chk}
    function go(p) {
        const v = p == "secret" ? Inner.Ok2 : Inner::Bad("bad")
        @msg = chk(${arg}) ? "rejected" : "LOGGED IN"
    }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
function chain(n) {
  const files = { "h0.scrml": H0 };
  for (let k = 1; k <= n; k++) files[`h${k}.scrml`] = `import { C${k - 1 === 0 ? "0" : k - 1} } from "./h${k - 1}.scrml"\n\${\n    export type C${k} = C${k - 1}\n}\n`;
  files["h0.scrml"] = `\${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export type C0 = Inner\n}\n`;
  return files;
}
const MULTI = [
  ["1 R11c struct field of an imported enum", `import { Inner } from "./h0.scrml"\n` + GO(`type SS:struct = { k: Inner }\n    function chk(s: SS) { return s.k.reason == "bad" }`, `{ k: v }`), { "h0.scrml": H0 }],
  ["1 R11b struct field of an imported alias", `import { I0, Inner } from "./h0.scrml"\n` + GO(`type SS:struct = { k: I0 }\n    function chk(s: SS) { return s.k.reason == "bad" }`, `{ k: v }`), { "h0.scrml": H0 }],
  ["1 R11 struct field of an imported alias of an alias", `import { K } from "./m.scrml"\nimport { Inner } from "./h0.scrml"\n` + GO(`type SS:struct = { k: K }\n    function chk(s: SS) { return s.k.reason == "bad" }`, `{ k: v }`),
    { "h0.scrml": H0, "m.scrml": `import { I0 } from "./h0.scrml"\n\${\n    export type K = I0\n}\n` }],
  ["1 DEPTH a chain of 80 imported aliases (fail closed)", `import { C80 } from "./h80.scrml"\nimport { Inner } from "./h0.scrml"\n` + GO(`function chk(x: C80) { return x.reason == "bad" }`, `v`), chain(80)],
];

function page(side, d, body) {
  if (side === "library") return `\${\n    ${d}\n    export function login(p) {\n        ${body}\n    }\n}\n`;
  if (side === "tool") return `<program kind="tool">\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
  if (side === "server") return `<msg> = "init"\n\${\n    ${d}\n    server function login(p) {\n        ${body}\n    }\n    function go() { @msg = login("wrong") !{ _ :> "err" } }\n}\n<button onclick=go()>go</button>\n<p>\${@msg}</p>\n`;
  return `<msg> = "init"\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function go(p) { @msg = login(p) }\n}\n<button id="wrong" onclick=go("wrong")>go</button>\n<button id="right" onclick=go("secret")>go</button>\n<p id="out">\${@msg}</p>\n`;
}

// Measured on 73d4e2e2d. The cycle shapes P2 / P3 / P5 / P8 (the order that happened to be refused there)
// are not here: they did not FAIL there — the order-independence is the unit tests'. On the server side
// every cycle shape was PASS-500 there (the cycle's functions were not shipped to the server bundle), so
// there is no server family.
const SKIP = new Set([
  ...["1 P1 mutual: f returns g, g only f; call f", "1 P4 mutual: f only g; call g", "1 P6 3-cycle; call g", "1 P7 3-cycle; call h then f"].map((n) => `server/${n}`),
]);

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = [];
  for (const [n, b] of CYCLES) out.push([n, page(side, DD(srv), b), undefined]);
  if (side === "fullstack") for (const [n, src, extra] of MULTI) out.push([n, src, extra]);
  return out.filter(([n]) => !SKIP.has(`${side}/${n}`));
}
