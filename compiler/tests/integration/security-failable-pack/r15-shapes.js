// S470 s470-typed-payload-binders, fix round 4 (adversarial review of 3620e8670: FIX) — server `s18`,
// fullstack `f21`, library `l13`, tool `t13`. The review's probes (~/.cache/scrml/review/s470-lb4/):
//   - I1–I3: an imported function's result, inferred through the dependency's own LOCAL helper, or a
//     cycle of functions inside a dependency / across two dependencies (calls inside an imported body
//     were never inferred);
//   - DEEP-EXPR: a ternary nested past the reader's old bound (34, 40 deep) or a 40-long `||` chain was
//     unchecked (the bound returned "unknown", not the fail-closed limit);
//   - STAR-PREC: `export * from "./a.scrml"` (a struct `I0`) then `export { I0 } from "./b.scrml"` (an
//     enum): the named re-export must win, as in ES modules; the first match in statement order did.
// The SCC-EXP perf fix is guarded by unit tests (an inference-count bound), not here. Unit-tested only (they
// cannot be measured FAIL on 3620e8670): STAR-PREC k2 X7 (its page's client bundle throws at load there — it imports a
// TYPE through the `export *` module) and mutual recursion ACROSS two modules (an import cycle: E-IMPORT-002, §21.3).
// Every shape is FAIL on 3620e8670 on its side and PASS-REFUSED after (E-TYPE-004); shapes that could not
// fail on a side there are left off it (multi-file shapes are fullstack only: the library / tool importer
// and the server bundle of an importing file do not load — g-library-tool-cross-file-import-source-path-s469,
// g-server-js-imports-module-without-server-file-s467). Data, not logic: `shapesFor(side)` returns
// [name, scrml source, extraFiles?]. Do not edit a shape to make it pass.

const nest = (k) => { let s = `Inner::Bad("bad")`; for (let i = 0; i < k; i++) s = `(p != "q${i}" ? ${s} : Inner::Ok2)`; return s; };
const ors = (k) => Array.from({ length: k }, () => `Inner::Bad("bad")`).join(" || ");
const R = (x) => `return ${x}.reason == "bad" ? "rejected" : "LOGGED IN"`;
const G = `if (p == "secret") { return "LOGGED IN" }\n        `;
const DEEP = [
  ["1 D2 a 40-deep ternary", `${G}const x = ${nest(40)}\n        ${R("x")}`],
  ["1 D3 a 40-long || chain", `${G}const x = ${ors(40)}\n        ${R("x")}`],
  ["1 D5 a 34-deep ternary", `${G}const x = ${nest(34)}\n        ${R("x")}`],
];
const H = `\${
    export type Inner:enum = { Bad(reason: string), Ok2 }
    function helper(p) {
        if (p != "secret") return Inner::Bad("bad")
        return Inner::Ok2
    }
    export function viaHelper(p) { return helper(p) }
    export function mutA(p) {
        if (p != "secret") return Inner::Bad("bad")
        return mutB(p)
    }
    export function mutB(p) { return mutA("x") }
}
`;
const H2 = `import { cross2 } from "./h3.scrml"
import { Inner } from "./h.scrml"
\${
    export function cross1(p) {
        if (p != "secret") return Inner::Bad("bad")
        return cross2(p)
    }
}
`;
const H3 = `import { cross1 } from "./h2.scrml"
\${
    export function cross2(p) { return cross1("x") }
}
`;
const GO = (imports, decls, valueExpr) => `${imports}
<msg> = "init"
\${
    server function ping(q) { return q }
    ${decls}
    function go(p) { @msg = (${valueExpr}) ? "rejected" : "LOGGED IN" }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
const IMPORTED = [
  ["1 I1 an imported fn through its module's local helper", GO(`import { Inner, viaHelper } from "./h.scrml"`, "", `p != "secret" && viaHelper(p).reason == "bad"`), { "h.scrml": H }],
  ["1 I2 imported mutual recursion, call A", GO(`import { Inner, mutA } from "./h.scrml"`, "", `p != "secret" && mutA(p).reason == "bad"`), { "h.scrml": H }],
  ["1 I3 imported mutual recursion, call B", GO(`import { Inner, mutB } from "./h.scrml"`, "", `p != "secret" && mutB(p).reason == "bad"`), { "h.scrml": H }],
];

function page(side, d, body) {
  if (side === "library") return `\${\n    ${d}\n    export function login(p) {\n        ${body}\n    }\n}\n`;
  if (side === "tool") return `<program kind="tool">\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
  if (side === "server") return `<msg> = "init"\n\${\n    ${d}\n    server function login(p) {\n        ${body}\n    }\n    function go() { @msg = login("wrong") !{ _ :> "err" } }\n}\n<button onclick=go()>go</button>\n<p>\${@msg}</p>\n`;
  return `<msg> = "init"\n\${\n    ${d}\n    function login(p) {\n        ${body}\n    }\n    function go(p) { @msg = login(p) }\n}\n<button id="wrong" onclick=go("wrong")>go</button>\n<button id="right" onclick=go("secret")>go</button>\n<p id="out">\${@msg}</p>\n`;
}

// Measured on 3620e8670: shapes that did not fail there on a side.
const SKIP = new Set([
]);

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = [];
  for (const [n, b] of DEEP) out.push([n, page(side, `${srv}function ping(q) { return q }\n    type Inner:enum = { Bad(reason: string), Ok2 }`, b), undefined]);
  if (side === "fullstack") for (const [n, src, extra] of IMPORTED) out.push([n, src, extra]);
  return out.filter(([n]) => !SKIP.has(`${side}/${n}`));
}
