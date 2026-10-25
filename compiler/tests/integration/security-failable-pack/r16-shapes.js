// S470 s470-unit-variant-tag-read — `.variant` read off a UNIT enum variant value, on every side
// (server `s19`, fullstack `f22`, library `l14`, tool `t14`). A unit variant is emitted as its bare tag
// string (§51.3.2) and a payload variant as `{ variant, data }`, so a plain JS `x.variant` read
// `undefined` off a unit variant: `x.variant == "Gone"` was false where `x is .Gone` is true, and a
// "reject when Gone" gate logged a wrong password in (lane B review, s470-lb4 b12 V2). Every value
// source a unit variant arrives from: a return, a literal, a call read directly, a parameter, an
// object / struct field, a tape element, a `match` result, a callback, a function expression, `?.`,
// a template, an import, a cell (fullstack). VALID controls: the error envelope's `.variant`, a
// payload variant, `is .Gone`, a struct-like object with its own `variant` field (string, number, and
// written through `s.variant = …`).
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const ENUM = `type AuthErr:enum = { Denied(reason: string), Gone }`;

function cases(srv, side) {
  // wrong password -> AuthErr::Gone (a unit variant); right -> AuthErr::Denied("ok") (a payload variant)
  const D = (more = "") => `${ENUM}
    ${srv}function mkG(p) -> AuthErr {
        if (p != "secret") return AuthErr::Gone
        return AuthErr::Denied("ok")
    }
    ${more}`;
  const G = (cond) => `return ${cond} ? "rejected" : "LOGGED IN"`;
  const WRAP = `${srv}function wrapG(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Gone
        return true
    }`;
  const LIB = { "h.scrml": `\${\n    type HErr:enum = { Denied(reason: string), Gone }\n    export ${srv}function mkH(p) -> HErr {\n        if (p != "secret") return HErr::Gone\n        return HErr::Denied("ok")\n    }\n}\n` };
  const out = [
    ["1 typed local from a return", D(), `const x: AuthErr = mkG(p)\n        ${G(`x.variant == "Gone"`)}`],
    ["1 untyped local from a return", D(), `const x = mkG(p)\n        ${G(`x.variant == "Gone"`)}`],
    ["1 not-equal gate", D(), `const x = mkG(p)\n        return x.variant != "Gone" ? "LOGGED IN" : "rejected"`],
    ["2 unit literal in a ternary", D(), `const x = p != "secret" ? AuthErr::Gone : AuthErr::Denied("ok")\n        ${G(`x.variant == "Gone"`)}`],
    ["2 dot literal, typed local", D(), `const x: AuthErr = p != "secret" ? .Gone : .Denied("ok")\n        ${G(`x.variant == "Gone"`)}`],
    ["3 call read directly", D(), G(`mkG(p).variant == "Gone"`)],
    ["3 call read in an if", D(), `if (mkG(p).variant == "Gone") { return "rejected" }\n        return "LOGGED IN"`],
    ["4 typed parameter", D(`function gone(x: AuthErr) { return x.variant == "Gone" }`), G(`gone(mkG(p))`)],
    ["5 object field", D(), `const r = { err: mkG(p) }\n        ${G(`r.err.variant == "Gone"`)}`],
    ["5 struct field", D(`type Res:struct = { err: AuthErr }`), `const r: Res = { err: mkG(p) }\n        ${G(`r.err.variant == "Gone"`)}`],
    ["6 tape element", D(), `const t = [mkG(p)]\n        ${G(`t[0].variant == "Gone"`)}`],
    ["6 for-of over a tape", D(), `for (const v of [mkG(p)]) { if (v.variant == "Gone") { return "rejected" } }\n        return "LOGGED IN"`],
    ["7 match result", D(), `const q: string = p
        const x = match q { "secret" :> AuthErr::Denied("ok"), else :> AuthErr::Gone }\n        ${G(`x.variant == "Gone"`)}`],
    ["8 expression-arrow callback", D(), G(`[mkG(p)].filter((v) => v.variant == "Gone").length > 0`)],
    ["8 block-arrow value", D(), `const f = (v) => { return v.variant == "Gone" }\n        ${G(`f(mkG(p))`)}`],
    ["8 function expression value", D(), `const f = function(v) { return v.variant == "Gone" }\n        ${G(`f(mkG(p))`)}`],
    ["9 optional chain", D(), `const x = mkG(p)\n        ${G(`x?.variant == "Gone"`)}`],
    ["9 template literal", D(), `const x = mkG(p)\n        ${G("`${x.variant}` == \"Gone\"")}`],
    // `is` lowered from text: a `match` arm value testing a PAYLOAD variant (`=== "Denied"` before)
    ["14 match arm is .Denied (payload)", D(`${srv}function mkD(p) -> AuthErr {
        if (p != "secret") return AuthErr::Denied("bad")
        return AuthErr::Gone
    }`), `const x = mkD(p)\n        const q: string = p\n        return match q { "zz" :> "z", else :> x is .Denied ? "rejected" : "LOGGED IN" }`],
    ["10 imported function", ENUM, `const x = mkH(p)\n        ${G(`x.variant == "Gone"`)}`, `import { mkH } from "./h.scrml"`, LIB],
    // valid controls — these read a real `variant` property (or no `.variant` at all)
    ["VALID error envelope e.variant", `${ENUM}\n    ${WRAP}`, `const v = wrapG(p) !{ _ e :> e.variant == "Gone" ? "rejected" : "LOGGED IN" }\n        return v == true ? "LOGGED IN" : v`],
    ["VALID payload variant .variant", D(), `const x = p != "secret" ? AuthErr::Denied("bad") : AuthErr::Gone\n        ${G(`x.variant == "Denied"`)}`],
    ["VALID is .Gone", D(), `const x: AuthErr = mkG(p)\n        ${G(`x is .Gone`)}`],
    ["VALID struct-like string variant field", D(), `let g = false\n        if (mkG(p) is .Gone) { g = true }\n        const s = { variant: g ? "Gone" : "Ok" }\n        ${G(`s.variant == "Gone"`)}`],
    ["VALID struct-like number variant field", D(), `let g = false\n        if (mkG(p) is .Gone) { g = true }\n        const s = { variant: g ? 1 : 2 }\n        ${G(`s.variant == 1`)}`],
    ["VALID variant field written then read", D(), `const s = { variant: "Ok" }\n        if (mkG(p) is .Gone) { s.variant = "Gone" }\n        ${G(`s.variant == "Gone"`)}`],
    // fix round 1 (review of be176f6ff) — F2: a destructured `variant` key
    ["15 F2 destructure variant", D(), `const { variant } = mkG(p)\n        ${G(`variant == "Gone"`)}`],
    ["15 F2 destructure renamed", D(), `const { variant: tag } = mkG(p)\n        ${G(`tag == "Gone"`)}`],
    ["15 F2 destructure let with default", D(), `let { variant = "none" } = mkG(p)\n        ${G(`variant == "Gone"`)}`],
    ["15 F2 destructure nested", D(), `const { e: { variant } } = { e: mkG(p) }\n        ${G(`variant == "Gone"`)}`],
    // fix round 2 — G1 in a function body (the structured declaration path)
    ["21 G1 array element pattern", D(), `const [{ variant }] = [mkG(p)]\n        ${G(`variant == "Gone"`)}`],
    // F3: a literal-key read
    ["16 F3 literal key", D(), `const x = mkG(p)\n        ${G(`x["variant"] == "Gone"`)}`],
    ["16 F3 optional literal key", D(), `const x = mkG(p)\n        ${G(`x?.["variant"] == "Gone"`)}`],
    // F6: a qualified `is` (the parser folds `AuthErr.Denied` into one name; it compared the constructor)
    ["17 F6 qualified is, payload", D(`${srv}function mkD(p) -> AuthErr {
        if (p != "secret") return AuthErr::Denied("bad")
        return AuthErr::Gone
    }`), `const x = mkD(p)\n        ${G(`x is AuthErr.Denied`)}`],
    ["17 F6 qualified is in a match arm, payload", D(`${srv}function mkD(p) -> AuthErr {
        if (p != "secret") return AuthErr::Denied("bad")
        return AuthErr::Gone
    }`), `const x = mkD(p)\n        const q: string = p\n        return match q { "zz" :> "z", else :> x is AuthErr.Denied ? "rejected" : "LOGGED IN" }`],
    // regressions of be176f6ff (F4 / F5): must keep compiling and keep their value
    ["VALID F4 swap through an assignment pattern", D(), `const s = { variant: "a", k: "b" }\n        ;[s.variant, s.k] = [s.k, s.variant]\n        if (s.variant != "b") { return "LOGGED IN" }\n        ${G(`mkG(p) is .Gone`)}`],
    ["VALID F5 multi-line template keeps .variant text", D(`${side === "library" ? "export " : ""}const DOC = \`line one
  read x.variant here
end\``), `if (!DOC.includes("x.variant")) { return "LOGGED IN" }\n        ${G(`mkG(p) is .Gone`)}`],
  ];
  // a reactive cell holding a unit variant (a client function body: fullstack only)
  if (side === "fullstack") out.push(["11 cell holding a unit variant", D(), `@st = mkG(p)\n        ${G(`@st.variant == "Gone"`)}`, undefined, undefined, `<st> = "init"`]);
  return out;
}

function page(side, d, body, imports = "", cells = "") {
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
${cells}
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

// Fullstack only: the CLIENT positions a `.variant` read is lowered in outside a function body — a
// markup interpolation, a derived cell, an `if=` attribute, an inline / block handler, a `when` body, a
// `match` arm lowered from text, a callback, a `for … lift` row — plus `is` in a function value (a
// control: the `is` lowering already normalized the tag). The full page, not the login template.
function fullstackPages() {
  const DECL = `${ENUM}
    server function mkG(p) -> AuthErr {
        if (p != "secret") return AuthErr::Gone
        return AuthErr::Denied("ok")
    }
    server function mkD(p) -> AuthErr {
        if (p != "secret") return AuthErr::Denied("bad")
        return AuthErr::Gone
    }`;
  const R = `"rejected" : "LOGGED IN"`;
  const pg = (logic, out, btn = (p) => `go("${p}")`, cells = "") => `<msg> = "init"
<st> = "init"
${cells}
\${
    ${DECL}
    ${logic}
}
<button id="wrong" onclick=${btn("wrong")}>go</button>
<button id="right" onclick=${btn("secret")}>go</button>
<p id="out">${out}</p>
`;
  const GO = `function go(p) { @st = mkG(p) }`;
  const XS = `function go(p) { @xs = [{ id: 1, e: mkG(p) }] }`;
  const XC = `<xs> = []`;
  const D1 = undefined;
  return [
    ["12 markup interpolation", pg(GO, `\${@st.variant == "Gone" ? ${R}}`)],
    ["12 derived cell", pg(`${GO}\n    const <d> = @st.variant == "Gone" ? ${R}`, `\${@d}`)],
    ["12 if= attribute", pg(GO, `<span if=\${@st != "init" && @st.variant != "Gone"}>LOGGED IN</span>`)],
    ["12 for-lift row", pg(GO, `\${ for (const v of [@st]) { lift <span>\${v.variant == "Gone" ? ${R}}</span> } }`)],
    ["13 inline handler expression", pg(`function noop() { }`, `\${@msg}`, (p) => `\${@msg = mkG("${p}").variant == "Gone" ? ${R}}`)],
    ["13 handler block statement", pg(`function noop() { }`, `\${@msg}`, (p) => `\${() => { const x = mkG("${p}")\n @msg = x.variant == "Gone" ? ${R} }}`)],
    ["13 when body", pg(`${GO}\n    when @st changes { @msg = @st.variant == "Gone" ? ${R} }`, `\${@msg}`)],
    ["13 match arm value", pg(`function go(p) { const x = mkG(p)\n @msg = match p { "zz" :> "z", else :> x.variant == "Gone" ? ${R} } }`, `\${@msg}`)],
    ["13 cell read in a function", pg(`function go(p) { @st = mkG(p)\n @msg = @st.variant == "Gone" ? ${R} }`, `\${@msg}`)],
    ["13 tape map callback", pg(`function go(p) { @msg = [mkG(p)].map((v) => v.variant)[0] == "Gone" ? ${R} }`, `\${@msg}`)],
    // fix round 1 — F1: an `<each>` row (rows lowered as text by emit-each), and F2 in a `when` body
    ["18 F1 each row r.e.variant", pg(XS, `<each in=@xs key=@.id as r>\${r.e.variant == "Gone" ? ${R}}</each>`, D1, XC)],
    ["18 F1 each row @.e.variant", pg(XS, `<each in=@xs key=@.id><span>\${@.e.variant == "Gone" ? ${R}}</span></each>`, D1, XC)],
    ["18 F1 each row if=", pg(XS, `<each in=@xs key=@.id as r><span if=\${r.e.variant != "Gone"}>LOGGED IN</span></each>`, D1, XC)],
    ["18 F1 each row of unit values", pg(`function go(p) { @xs = [mkG(p)] }`, `<each in=@xs as r><span>\${r.variant == "Gone" ? ${R}}</span></each>`, D1, XC)],
    ["18 F1 each row template literal", pg(XS, "<each in=@xs key=@.id as r><span>${`${r.e.variant}` == \"Gone\" ? " + R + "}</span></each>", D1, XC)],
    ["19 F2 when body destructure", pg(`${GO}\n    when @st changes { const { variant } = @st\n @msg = variant == "Gone" ? ${R} }`, `\${@msg}`)],
    // fix round 2 (re-review of 43386e9d5) — G1: a text-lowered (`when` body) pattern naming `variant`
    // anywhere but the top of the first declarator's object, or as a quoted / computed key
    ["20 G1 when array element pattern", pg(`${GO}\n    when @st changes { const [{ variant }] = [@st]\n @msg = variant == "Gone" ? ${R} }`, `\${@msg}`)],
    ["20 G1 when later array element", pg(`${GO}\n    when @st changes { const [a, { variant }] = [1, @st]\n @msg = variant == "Gone" ? ${R} }`, `\${@msg}`)],
    ["20 G1 when array under a key", pg(`${GO}\n    when @st changes { const { a: [{ variant }] } = { a: [@st] }\n @msg = variant == "Gone" ? ${R} }`, `\${@msg}`)],
    ["20 G1 when later declarator", pg(`${GO}\n    when @st changes { const y = 1, { variant } = @st\n @msg = variant == "Gone" && y == 1 ? ${R} }`, `\${@msg}`)],
    ["20 G1 when quoted key", pg(`${GO}\n    when @st changes { const { "variant": v } = @st\n @msg = v == "Gone" ? ${R} }`, `\${@msg}`)],
    ["20 G1 when computed key", pg(`${GO}\n    when @st changes { const { ["variant"]: v } = @st\n @msg = v == "Gone" ? ${R} }`, `\${@msg}`)],
    ["19 F3 when body literal key", pg(`${GO}\n    when @st changes { @msg = @st["variant"] == "Gone" ? ${R} }`, `\${@msg}`)],
    ["VALID function expression is .Denied (payload)", pg(`function go(p) { const f = function(v) { return v is .Denied }\n @msg = f(mkD(p)) ? ${R} }`, `\${@msg}`)],
    ["VALID block arrow is .Gone (unit)", pg(`function go(p) { const f = (v) => { return v is .Gone }\n @msg = f(mkG(p)) ? ${R} }`, `\${@msg}`)],
    ["VALID markup is .Gone", pg(GO, `\${@st is .Gone ? ${R}}`)],
  ].map(([n, src]) => [n, src, undefined]);
}

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = cases(srv, side).map(([n, d, b, imp, extra, cells]) => [n, page(side, d, b, imp ?? "", cells ?? ""), extra ?? undefined]);
  return side === "fullstack" ? [...out, ...fullstackPages()] : out;
}
