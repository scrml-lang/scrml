// Probe family `f1` — S469 s469-server-return-match-await (g-server-return-match-failable-subject-unawaited-s469),
// the CLIENT half: a client function's `match` whose subject (or arm value) is a SERVER call — at every
// expression position — and the payload binders of its arms. Side: fullstack (pack.js) — the page runs under
// happy-dom and its `fetch` is answered in-process by the compiled app.server.js, so a client -> server call
// is judged end to end (click #wrong / #right, read #out). Data, not logic: the default export is a list of
// [name, scrml source]. Do not edit a shape to make it pass.
//
// See s4.js for the server half. Measured on b35babcc2 (33 shapes): 21 FAIL — every position below except
// `const` / statement match / a const arm value and the refused ones (the client emitted the fetch stub
// unawaited: the Promise read as `.Ok`; the expression bridge dropped the async facts) and the binders
// (the server's bare `data: "bad"` read as `.data.reason` → undefined). After: 2 FAIL, both RENDER-time
// (KNOWN_FAIL, g-render-match-async-subject-unawaited-s469); the rest PASS or PASS-REFUSED.

export const SIDE = "fullstack";

const L = (body, pre = "") => `type AuthErr:enum = { Denied(reason: string), Gone }
type Shape:enum = { Circle(r: number), Rect(w: number, h: number) }
<msg> = "init"
<pw> = ""
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    server function roleOf(p) {
        if (p != "secret") { return { role: "guest" } }
        return { role: "admin" }
    }
    server function isOk(p) { return p == "secret" }
    server function shapeOf(p) -> Shape {
        if (p != "secret") { return Shape.Circle(1) }
        return Shape.Rect(2, 3)
    }
${pre}
    function login(p) {
${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
const ARMS = `.Denied(r) :> "rejected", .Gone :> "rejected", else :> "LOGGED IN"`;
const RARMS = `.Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN"`;

// A RENDER-time match (an interpolation, a derived cell): no function body to await in.
const RENDER = `type AuthErr:enum = { Denied(reason: string), Gone }
type Access:enum = { Granted, Rejected }
<pw> = ""
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
`;
const RARM_ELSE = `.Denied(r) :> "rejected", .Gone :> "rejected", else :> (@pw == "" ? "rejected" : "LOGGED IN")`;

export default [
  // -- the subject, by position --
  ["return match", L(`return match check(p) { ${ARMS} }`)],
  ["return match (newline arms)", L(`return match check(p) {\n .Denied(r) :> "rejected"\n .Gone :> "rejected"\n else :> "LOGGED IN"\n }`)],
  ["return match, paren subject", L(`return match (check(p)) { ${ARMS} }`)],
  ["return match, Ok binder", L(`return match check(p) { .Denied(r) :> "rejected", .Gone :> "rejected", .Ok(v) :> v == true ? "LOGGED IN" : "rejected" }`)],
  ["const match", L(`const v = match check(p) { ${ARMS} }\n return v`)],
  ["reassignment", L(`let v = ""\n v = match check(p) { ${ARMS} }\n return v`)],
  ["call argument", L(`return String(match check(p) { ${ARMS} })`)],
  ["template slot", L("return `${match check(p) { " + ARMS + " }}`")],
  ["nested match subject", L(`return match (match check(p) { ${ARMS} }) { "rejected" :> "rejected", else :> "LOGGED IN" }`)],
  ["statement match", L(`let v = ""\n match check(p) { .Denied(r) :> { v = "rejected" } .Gone :> { v = "rejected" } else :> { v = "LOGGED IN" } }\n return v`)],
  ["cell write", L(`@pw = match check(p) { ${ARMS} }\n return @pw`)],
  ["if condition", L(`if ((match check(p) { ${ARMS} }) == "LOGGED IN") { return "LOGGED IN" }\n return "rejected"`)],
  ["logical operand", L(`return (p != "" && match check(p) { ${ARMS} }) || "rejected"`)],
  ["object field", L(`const o = { v: match check(p) { ${ARMS} } }\n return o.v`)],
  ["arrow body", L(`const f = () => match check(p) { ${ARMS} }\n return f()`)],
  ["helper subject", L(`return match helper(p) { ${ARMS} }`, `    function helper(p)! -> AuthErr { return check(p) }`)],
  ["multi-scrutinee return match", L(`return match (check(p), 1) { (.Denied(r), _) :> "rejected", (.Gone, _) :> "rejected", (_, _) :> "LOGGED IN" }`)],
  ["multi-scrutinee reassignment", L(`let v = ""\n v = match (check(p), 1) { (.Denied(r), _) :> "rejected", (.Gone, _) :> "rejected", (_, _) :> "LOGGED IN" }\n return v`)],
  // -- a member read off a server call --
  ["member subject, return", L(`return match roleOf(p).role { "guest" :> "rejected", else :> "LOGGED IN" }`)],
  ["member subject, reassignment", L(`let v = ""\n v = match roleOf(p).role { "guest" :> "rejected", else :> "LOGGED IN" }\n return v`)],
  // -- an arm VALUE that calls a server function --
  ["arm value server call, return", L(`const k = "a"\n return match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }`)],
  ["arm value server call, const", L(`const k = "a"\n const v = match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }\n return v`)],
  ["arm value server call, reassignment", L(`const k = "a"\n let v = ""\n v = match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }\n return v`)],
  // -- the payload binders --
  ["binder: positional, return match", L(`return match check(p) { ${RARMS} }`)],
  ["binder: positional, const", L(`const v = match check(p) { ${RARMS} }\n return v`)],
  ["binder: named", L(`return match check(p) { .Denied(reason: r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`)],
  ["binder: named, misspelled", L(`return match check(p) { .Denied(rsn: r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`)],
  ["binder: Shape | not subject", L(`return area(shapeOf(p))`, `    function area(k: Shape | not) {\n        return match k { .Circle(r) :> r == 1 ? "rejected" : "LOGGED IN", .Rect(w, h) :> w == 2 ? "LOGGED IN" : "rejected", not :> "rejected" }\n    }`)],
  ["binder: too many", L(`const k = shapeOf(p)\n return match k { .Circle(r, z) :> r == 1 ? "rejected" : "LOGGED IN", .Rect(w, h) :> w == 2 ? "LOGGED IN" : "rejected" }`)],
  ["binder: named, misspelled, enum subject", L(`const k = shapeOf(p)\n return match k { .Circle(rad: r) :> r == 1 ? "rejected" : "LOGGED IN", .Rect(w, h) :> w == 2 ? "LOGGED IN" : "rejected" }`)],
  // -- a render-time match (no function body to await in) --
  ["render: engine derived=match", RENDER + `<engine for=Access derived=match check(@pw) { .Denied(r) :> .Rejected, .Gone :> .Rejected, else :> .Granted }>
  <Granted/>
  <Rejected/>
</>
<p id="out">\${match @access { .Granted :> "LOGGED IN", else :> "rejected" }}</p>
`],
  ["render: markup interpolation", RENDER + `<p id="out">\${match check(@pw) { ${RARM_ELSE} }}</p>\n`],
  ["render: derived cell", RENDER + `\${ const <okc> = match check(@pw) { ${RARM_ELSE} } }\n<p id="out">\${@okc}</p>\n`],
];
