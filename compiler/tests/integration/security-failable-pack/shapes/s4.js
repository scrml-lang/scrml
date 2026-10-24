// Probe family `s4` — S469 s469-server-return-match-await (g-server-return-match-failable-subject-unawaited-s469).
// A `match` in a SERVER function whose SUBJECT (or arm value) is an async call — a `!` function, a server
// function, a member read off one — at every expression position, and the payload BINDERS of the arms.
// Data, not logic: the default export is a list of [name, scrml source, extraFiles?]. Side: server (POST the
// `login` route with p="wrong" / "secret"). Do not edit a shape to make it pass.
//
// Measured on b35babcc2 (#1524 head, before this unit; 48 shapes): 13 FAIL — `return match` (comma and
// newline arms, a paren subject, a positional binder), a nested match subject, a multi-scrutinee `return
// match`, a member subject (`roleOf(p).role`), an arm value calling a server function, a NAMED binder
// spelled right (`.Denied(reason: r)` — the server wrote the bare `data: "bad"`), a misspelled named binder
// (failable and enum subjects), too many binders on a failable subject; 3 PASS-500 (`r is not defined`: a
// positional binder in a `const` / statement match, a `Shape | not` subject); 12 PASS-REFUSED as
// E-CODEGEN-INVALID-LOGIC — a stranded `await` in the text lowering's sync IIFE (a reassignment, a call
// argument, a template slot, an `if` condition, an operand, an object field, an array element, ...); 1
// PASS-DENY (`.Ok(v)` bound the Promise); too many / too few / mixed binders on an enum subject compiled
// clean (SPEC §18.7 makes each E-TYPE-021). After: 0 FAIL, 0 PASS-500 — every subject and arm value is
// awaited; binders bind by declared field order; a mis-counted / mixed / misspelled binder is E-TYPE-021 /
// E-TYPE-022. Still refused (fail closed, filed g-impl1-async-match-positions-refused-s469): a `match` as a
// ternary operand or an arrow's expression body (split into statements), an arm value calling a server
// function in a reassignment (server text arm), a function-expression body / `const` alias (by design).

export const SIDE = "server";

const S = (body, pre = "") => `type AuthErr:enum = { Denied(reason: string), Gone }
type Shape:enum = { Circle(r: number), Rect(w: number, h: number) }
<msg> = "init"
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
    server function login(p) {
${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
const ARMS = `.Denied(r) :> "rejected", .Gone :> "rejected", else :> "LOGGED IN"`;
const RARMS = `.Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN"`;
const SHAPE = (circle, rect) => `const k = shapeOf(p)\n return match k { ${circle} :> r == 1 ? "rejected" : "LOGGED IN", ${rect} :> w == 2 ? "LOGGED IN" : "rejected" }`;

export default [
  // -- the subject, by position --
  ["return match", S(`return match check(p) { ${ARMS} }`)],
  ["return match (newline arms)", S(`return match check(p) {\n .Denied(r) :> "rejected"\n .Gone :> "rejected"\n else :> "LOGGED IN"\n }`)],
  ["return match, paren subject", S(`return match (check(p)) { ${ARMS} }`)],
  ["return match, Ok binder", S(`return match check(p) { .Denied(r) :> "rejected", .Gone :> "rejected", .Ok(v) :> v == true ? "LOGGED IN" : "rejected" }`)],
  ["const match", S(`const v = match check(p) { ${ARMS} }\n return v`)],
  ["reassignment", S(`let v = ""\n v = match check(p) { ${ARMS} }\n return v`)],
  ["call argument", S(`return String(match check(p) { ${ARMS} })`)],
  ["template slot", S("return `${match check(p) { " + ARMS + " }}`")],
  ["nested match subject", S(`return match (match check(p) { ${ARMS} }) { "rejected" :> "rejected", else :> "LOGGED IN" }`)],
  ["statement match", S(`let v = ""\n match check(p) { .Denied(r) :> { v = "rejected" } .Gone :> { v = "rejected" } else :> { v = "LOGGED IN" } }\n return v`)],
  ["if condition", S(`if ((match check(p) { ${ARMS} }) == "LOGGED IN") { return "LOGGED IN" }\n return "rejected"`)],
  ["logical operand", S(`return (p != "" && match check(p) { ${ARMS} }) || "rejected"`)],
  ["object field", S(`const o = { v: match check(p) { ${ARMS} } }\n return o.v`)],
  ["array element", S(`const a = [match check(p) { ${ARMS} }]\n return a[0]`)],
  ["ternary operand", S(`return p == "" ? "rejected" : match check(p) { ${ARMS} }`)],
  ["arrow body", S(`const f = () => match check(p) { ${ARMS} }\n return f()`)],
  ["function-expression body", S(`const f = function() { return match check(p) { ${ARMS} } }\n return f()`)],
  ["const alias subject", S(`return match chk(p) { ${ARMS} }`, `    const chk = check`)],
  ["multi-scrutinee return match", S(`return match (check(p), 1) { (.Denied(r), _) :> "rejected", (.Gone, _) :> "rejected", (_, _) :> "LOGGED IN" }`)],
  ["multi-scrutinee const", S(`const v = match (check(p), 1) { (.Denied(r), _) :> "rejected", (.Gone, _) :> "rejected", (_, _) :> "LOGGED IN" }\n return v`)],
  ["multi-scrutinee statement", S(`let v = ""\n match (check(p), 1) { (.Denied(r), _) :> { v = "rejected" } (.Gone, _) :> { v = "rejected" } (_, _) :> { v = "LOGGED IN" } }\n return v`)],
  ["lift in a value for", S(`const vs = for (x of [p]) { lift match check(x) { ${ARMS} } }\n return vs[0]`)],
  ["lift in a value if", S(`const v = if (p != "") { lift match check(p) { ${ARMS} } } else { lift "rejected" }\n return v`)],
  // -- a member read off an async call (a deny-list on the field) --
  ["member subject, return", S(`return match roleOf(p).role { "guest" :> "rejected", else :> "LOGGED IN" }`)],
  ["member subject, const", S(`const v = match roleOf(p).role { "guest" :> "rejected", else :> "LOGGED IN" }\n return v`)],
  ["member subject, reassignment", S(`let v = ""\n v = match roleOf(p).role { "guest" :> "rejected", else :> "LOGGED IN" }\n return v`)],
  ["member subject, statement", S(`let v = ""\n match roleOf(p).role { "guest" :> { v = "rejected" } else :> { v = "LOGGED IN" } }\n return v`)],
  // -- an arm VALUE that calls an async function --
  ["arm value async call, return", S(`const k = "a"\n return match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }`)],
  ["arm value async call, const", S(`const k = "a"\n const v = match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }\n return v`)],
  ["arm value async call, reassignment", S(`const k = "a"\n let v = ""\n v = match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }\n return v`)],
  // -- an imported async function --
  ["imported check", `import { check } from "./auth.scrml"
type AuthErr:enum = { Denied(reason: string), Gone }
<msg> = "init"
\${
    server function login(p) {
        return match check(p) { ${ARMS} }
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`, { "auth.scrml": `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
    export server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
` }],
  ["imported member subject", `import { roleOf } from "./auth.scrml"
<msg> = "init"
\${
    server function login(p) {
        return match roleOf(p).role { "guest" :> "rejected", else :> "LOGGED IN" }
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`, { "auth.scrml": `\${
    export server function roleOf(p) {
        if (p != "secret") { return { role: "guest" } }
        return { role: "admin" }
    }
}
` }],
  // -- the payload binders (the deny-list reads the BOUND payload) --
  ["binder: positional, return match", S(`return match check(p) { ${RARMS} }`)],
  ["binder: positional, const", S(`const v = match check(p) { ${RARMS} }\n return v`)],
  ["binder: positional, statement", S(`let v = ""\n match check(p) { .Denied(r) :> { v = r == "bad" ? "rejected" : "LOGGED IN" } .Gone :> { v = "rejected" } else :> { v = "LOGGED IN" } }\n return v`)],
  ["binder: positional, reassignment", S(`let v = ""\n v = match check(p) { ${RARMS} }\n return v`)],
  ["binder: positional, !{} handler", S(`const v = check(p) !{ .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }\n return v == true ? "LOGGED IN" : v`)],
  ["binder: named", S(`return match check(p) { .Denied(reason: r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`)],
  ["binder: named, misspelled", S(`return match check(p) { .Denied(rsn: r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`)],
  ["binder: too many on a failable subject", S(`return match check(p) { .Denied(r, q) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected", else :> "LOGGED IN" }`)],
  ["binder: enum subject", S(SHAPE(".Circle(r)", ".Rect(w, h)"))],
  ["binder: Shape | not subject", S(`return area(shapeOf(p))`, `    server function area(k: Shape | not) {\n        return match k { .Circle(r) :> r == 1 ? "rejected" : "LOGGED IN", .Rect(w, h) :> w == 2 ? "LOGGED IN" : "rejected", not :> "rejected" }\n    }`)],
  ["binder: too many", S(SHAPE(".Circle(r, z)", ".Rect(w, h)"))],
  ["binder: too few", S(SHAPE(".Circle(r)", ".Rect(w)"))],
  ["binder: mixed positional and named", S(SHAPE(".Circle(r)", ".Rect(w, h: hh)"))],
  ["binder: named, misspelled, enum subject", S(SHAPE(".Circle(rad: r)", ".Rect(w, h)"))],
  ["binder: named, misspelled, reassignment", S(`const k = shapeOf(p)\n let v = ""\n v = match k { .Circle(rad: r) :> r == 1 ? "rejected" : "LOGGED IN", .Rect(w, h) :> w == 2 ? "LOGGED IN" : "rejected" }\n return v`)],
  ["binder: too many, reassignment", S(`const k = shapeOf(p)\n let v = ""\n v = match k { .Circle(r, z) :> r == 1 ? "rejected" : "LOGGED IN", .Rect(w, h) :> w == 2 ? "LOGGED IN" : "rejected" }\n return v`)],
];
